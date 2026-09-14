"""
Sherpa — оконный лаунчер для оверлея поверх Escape from Tarkov.

Что делает:
  * поднимает локальный HTTP-сервер со сборкой (dist/);
  * открывает её в окне WebView2 (Edge), которое умеет быть поверх всех окон;
  * ловит глобальные хоткеи через RegisterHotKey (штатный API Windows).

Чего НЕ делает: не трогает процесс игры, не читает память, не эмулирует ввод.
В игре нужен режим окна «Без рамки» (Borderless) — поверх Fullscreen окно не видно.
"""

from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import json
import math
import os
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)
if FROZEN:
    # Sherpa.exe: рядом с exe — config.json и sherpa.log; сборка сайта — внутри пакета
    ROOT = Path(sys.executable).resolve().parent
    DIST = Path(getattr(sys, "_MEIPASS", ROOT)) / "dist"
    CONFIG_PATH = ROOT / "config.json"
else:
    ROOT = Path(__file__).resolve().parent.parent
    DIST = ROOT / "dist"
    CONFIG_PATH = Path(__file__).resolve().parent / "config.json"

DEFAULT_CONFIG = {
    "port": 4879,
    "width": 1180,
    "height": 760,
    "on_top": True,
    "hotkey_toggle": "F10",
    "hotkey_on_top": "F9",
    "hotkey_minimap": "F8",
    # отдельное окно карты поверх игры (без меню и остальных разделов)
    "hotkey_map": "F7",
    # мини-карта: размер окна (px) и отступ от правого верхнего угла экрана
    "minimap_size": 320,
    "minimap_margin": 16,
    # прозрачность окон мини-карты и карты: 1.0 — непрозрачно, 0.3 — почти стекло (меняется и из интерфейса)
    "minimap_opacity": 1.0,
    "map_opacity": 1.0,
    "map_width": 960,
    "map_height": 680,
    # «Ты здесь»: следить за папкой скриншотов игры (в имени файла — координаты). Выключено по умолчанию.
    "screenshots_watch": False,
    "screenshots_path": "",
    # автоочистка: оставлять в папке скриншотов только последние N файлов (0 — не трогать).
    # Нужна, если скриншот повешен «на отпускание W» — файлов будут сотни за рейд.
    "screenshots_keep": 0,
    # доступ по локальной сети (телефон, второй монитор-планшет): слушать 0.0.0.0 вместо 127.0.0.1
    "lan": False,
    # сквад: поднять публичный адрес через cloudflared (winget install Cloudflare.cloudflared)
    "squad_tunnel": False,
}

# ── сквад: комнаты живут в памяти хоста, пока он запущен ──
SQUAD_ROOMS: dict[str, dict] = {}          # room → {"members": {name: {...}}, "map": str, "marks": {id: {...}}}
SQUAD_MARK_TTL = 60 * 60  # общая метка живёт час
SQUAD_CLIENTS: dict[str, list[queue.Queue]] = {}
SQUAD_LOCK = threading.Lock()
SQUAD_TTL = 20 * 60  # участник без обновлений 20 минут выпадает


def _room(room: str) -> dict:
    return SQUAD_ROOMS.setdefault(room, {"members": {}, "map": "", "marks": {}})


def squad_snapshot(room: str) -> dict:
    now = time.time()
    with SQUAD_LOCK:
        r = _room(room)
        for name in [n for n, m in r["members"].items() if now - m["ts"] > SQUAD_TTL]:
            del r["members"][name]
        for mid in [k for k, m in r["marks"].items() if now - m["ts"] > SQUAD_MARK_TTL]:
            del r["marks"][mid]
        return {"room": room, "members": dict(r["members"]), "map": r["map"], "marks": dict(r["marks"])}


def squad_broadcast(room: str):
    snap = squad_snapshot(room)
    for q in list(SQUAD_CLIENTS.get(room, [])):
        try:
            q.put_nowait(snap)
        except Exception:  # noqa: BLE001
            pass


def squad_publish(room: str, name: str, payload: dict):
    with SQUAD_LOCK:
        _room(room)["members"][name] = {**payload, "ts": time.time()}
    squad_broadcast(room)


def squad_set_map(room: str, map_name: str):
    with SQUAD_LOCK:
        _room(room)["map"] = map_name
    squad_broadcast(room)


def squad_mark(room: str, mark: dict, remove: bool):
    with SQUAD_LOCK:
        marks = _room(room)["marks"]
        if remove:
            marks.pop(mark["id"], None)
        else:
            marks[mark["id"]] = {**mark, "ts": time.time()}
    squad_broadcast(room)

# последняя позиция и подписчики SSE — общие для HTTP-обработчика и окна
LAST_POS: dict | None = None
DEBUG_API = None  # экземпляр Api для отладочного эндпоинта
SSE_CLIENTS: list[queue.Queue] = []


def publish_pos(pos: dict):
    global LAST_POS
    LAST_POS = pos
    for q in list(SSE_CLIENTS):
        try:
            q.put_nowait(pos)
        except Exception:  # noqa: BLE001
            pass

VK = {f"F{i}": 0x6F + i for i in range(1, 25)}  # F1 = 0x70 … F24 = 0x87
VK.update({"INSERT": 0x2D, "HOME": 0x24, "END": 0x23, "PAUSE": 0x13, "SCROLL": 0x91})

user32 = ctypes.windll.user32
GWL_EXSTYLE = -20
WS_EX_LAYERED = 0x00080000
LWA_ALPHA = 0x2
WM_HOTKEY = 0x0312
MOD_NOREPEAT = 0x4000


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except Exception as e:  # noqa: BLE001
            print(f"[sherpa] config.json не прочитан ({e}), использую значения по умолчанию")
    else:
        # первый запуск exe: кладём рядом config.json с настройками по умолчанию, чтобы было что править
        try:
            CONFIG_PATH.write_text(json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass
    return cfg


TT_API = "https://api.tarkovtracker.org"
TT_UA = "Sherpa/1.0 (+https://github.com/sherpa-tarkov)"

# ── обновления: последний релиз на GitHub (репозиторий публичный, токен не нужен) ──
UPDATE_REPO = "WOLF5ER/sherpa"
# SHERPA_UPDATE_API — подменить адрес (локальная проверка обновления на фальшивом релизе)
UPDATE_API = os.environ.get("SHERPA_UPDATE_API") or f"https://api.github.com/repos/{UPDATE_REPO}/releases/latest"
UPDATE_PAGE = f"https://github.com/{UPDATE_REPO}/releases/latest"
UPDATE_CHECK_EVERY = 6 * 3600


def app_version() -> str:
    """Версия сборки: vite кладёт dist/version.json из package.json."""
    try:
        return str(json.loads((DIST / "version.json").read_text(encoding="utf-8")).get("version") or "0.0.0")
    except Exception:  # noqa: BLE001
        return "0.0.0"


APP_VERSION = app_version()


def version_tuple(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3]) or (0,)


def fetch_latest_release() -> dict | None:
    """Тег, заметки и zip-архив последнего релиза; None — релизов нет или у него нет архива."""
    req = urllib.request.Request(UPDATE_API, headers={"User-Agent": TT_UA, "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        j = json.loads(r.read().decode("utf-8"))
    tag = str(j.get("tag_name") or "").strip().lstrip("vV")
    asset = next((a for a in j.get("assets", []) if str(a.get("name", "")).lower().endswith(".zip")), None)
    if not tag or not asset:
        return None
    return {
        "version": tag,
        "notes": (j.get("body") or "").strip(),
        "url": asset["browser_download_url"],
        "size": int(asset.get("size") or 0),
        "page": j.get("html_url") or UPDATE_PAGE,
        "published": j.get("published_at"),
    }


# скрипт подмены: ждёт выхода Sherpa, сносит старый _internal, переносит новую сборку, запускает. PowerShell — из-за путей с кириллицей.
UPDATE_SCRIPT = r"""
$p = {pid}; $src = '{src}'; $dst = '{dst}'; $upd = '{upd}'
while (Get-Process -Id $p -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 500 }}
Start-Sleep -Milliseconds 800
for ($i = 0; $i -lt 30; $i++) {{
  try {{ if (Test-Path -LiteralPath "$dst\_internal") {{ Remove-Item -LiteralPath "$dst\_internal" -Recurse -Force -ErrorAction Stop }}; break }} catch {{ Start-Sleep -Seconds 1 }}
}}
robocopy $src $dst /E /MOVE /R:10 /W:1 | Out-Null
Start-Process -FilePath "$dst\Sherpa.exe" -WorkingDirectory $dst
Remove-Item -LiteralPath $upd -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
"""


class QuietHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive и chunked-потоки; каждый ответ обязан иметь Content-Length или chunked
    def log_message(self, *_args):  # тишина в консоли
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        # /api/tt/<path> → TarkovTracker: их API требует User-Agent и не отдаёт CORS сторонним сайтам
        if self.path.startswith("/api/tt/"):
            return self._proxy_tt()
        if self.path == "/api/pos/last":
            return self._json(LAST_POS or {}, 200 if LAST_POS else 204)
        if self.path.startswith("/api/debug/js?") and os.environ.get("SHERPA_DEBUG") and DEBUG_API:
            # только для отладки: выполнить JS в окне лаунчера (SHERPA_DEBUG=1)
            from urllib.parse import unquote
            code = unquote(self.path.split("?", 1)[1])
            try:
                res = DEBUG_API._window.evaluate_js(code)
                return self._json({"ok": True, "result": res})
            except Exception as e:  # noqa: BLE001
                return self._json({"ok": False, "error": repr(e)}, 500)
        if self.path == "/api/pos/stream":
            return self._sse()
        m = re.match(r"^/api/squad/([A-Za-z0-9_-]{3,40})(/stream)?$", self.path)
        if m:
            room = m.group(1)
            if m.group(2):
                return self._sse_squad(room)
            return self._json(squad_snapshot(room))
        return super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/log":
            # страница присылает свои ошибки (window.onerror, промисы, ErrorBoundary) — в sherpa.log, чтобы было что смотреть у друзей
            try:
                n = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(min(n, 16000)) or b"{}")
                kind = str(body.get("kind") or "error")[:24]
                msg = str(body.get("message") or "")[:600].replace("\n", " ")
                stack = str(body.get("stack") or "")[:1200]
                where = str(body.get("where") or "")[:200]
                print(f"[page] {kind}: {msg}" + (f"  @ {where}" if where else "") + (f"\n    {stack}" if stack else ""))
            except Exception:  # noqa: BLE001
                pass
            return self._json({"ok": True})
        m = re.match(r"^/api/squad/([A-Za-z0-9_-]{3,40})(/map|/mark)?$", self.path)
        if not m:
            return self._json({"error": "not found"}, 404)
        room, kind = m.group(1), m.group(2)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            name = str(body.get("name") or "")[:24].strip() or "аноним"
            if kind == "/map":
                squad_set_map(room, str(body.get("map") or "")[:40])
            elif kind == "/mark":
                mark = {
                    "id": str(body.get("id") or "")[:40] or f"m{int(time.time() * 1000)}",
                    "by": name, "label": str(body.get("label") or "")[:40] or "Метка",
                    "x": float(body.get("x")), "z": float(body.get("z")), "y": float(body.get("y") or 0),
                    "map": str(body.get("map") or "")[:40],
                }
                squad_mark(room, mark, bool(body.get("remove")))
            else:
                payload = {"pos": body.get("pos"), "map": str(body.get("map") or "")[:40], "online": bool(body.get("online", True))}
                squad_publish(room, name, payload)
        except Exception:  # noqa: BLE001
            return self._json({"error": "bad json"}, 400)
        return self._json({"ok": True})

    def _cors(self):
        # друзья заходят со своего localhost или туннеля — нужен CORS
        self.send_header("Access-Control-Allow-Origin", "*")

    # ── SSE: HTTP/1.1 + chunked, каждое событие — отдельный chunk с flush. Так поток не буферизуют
    #    ни cloudflared, ни край Cloudflare (с HTTP/1.0 без длины гость через туннель не получал ни байта) ──
    def _sse_start(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "keep-alive")
        self.send_header("Transfer-Encoding", "chunked")
        self._cors()
        self.end_headers()
        # первый chunk — комментарий с «подушкой»: заставляет промежуточные прокси отдать заголовки и начать поток сразу
        self._sse_write(b": " + b" " * 2048 + b"\n\n")

    def _sse_write(self, data: bytes):
        self.wfile.write(f"{len(data):X}\r\n".encode() + data + b"\r\n")
        self.wfile.flush()

    def _sse_event(self, obj) -> bytes:
        return f"data: {json.dumps(obj)}\n\n".encode()

    def _sse_squad(self, room: str):
        self._sse_start()
        q: queue.Queue = queue.Queue()
        SQUAD_CLIENTS.setdefault(room, []).append(q)
        try:
            self._sse_write(self._sse_event(squad_snapshot(room)))
            while True:
                try:
                    self._sse_write(self._sse_event(q.get(timeout=15)))
                except queue.Empty:
                    self._sse_write(b": keepalive\n\n")
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            lst = SQUAD_CLIENTS.get(room, [])
            if q in lst:
                lst.remove(q)

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        if status != 204:
            self.wfile.write(body)

    def _sse(self):
        """Поток позиций для страниц без лаунчера (телефон в той же сети)."""
        self._sse_start()
        q: queue.Queue = queue.Queue()
        SSE_CLIENTS.append(q)
        try:
            if LAST_POS:
                self._sse_write(self._sse_event(LAST_POS))
            while True:
                try:
                    self._sse_write(self._sse_event(q.get(timeout=15)))
                except queue.Empty:
                    self._sse_write(b": keepalive\n\n")
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            if q in SSE_CLIENTS:
                SSE_CLIENTS.remove(q)

    def _proxy_tt(self):
        url = TT_API + self.path[len("/api/tt"):]
        headers = {"User-Agent": TT_UA, "Accept": "application/json"}
        auth = self.headers.get("Authorization")
        if auth:
            headers["Authorization"] = auth
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = resp.read()
                status = resp.status
                ctype = resp.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            body = e.read()
            status = e.code
            ctype = e.headers.get("Content-Type", "application/json")
        except Exception as e:  # noqa: BLE001
            body = json.dumps({"success": False, "error": f"TarkovTracker недоступен: {e}"}).encode()
            status = 502
            ctype = "application/json"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def is_sherpa_server(port: int) -> bool:
    """На порту именно Sherpa (или её dev-сервер), а не что-то чужое."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/pos/last", timeout=2) as r:
            return r.status in (200, 204) and "json" in (r.headers.get("Content-Type") or "")
    except urllib.error.HTTPError:
        return False
    except Exception:  # noqa: BLE001
        return False


def serve(port: int, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    handler = partial(QuietHandler, directory=str(DIST))
    httpd = ThreadingHTTPServer((host, port), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


CLOUDFLARED_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"


def find_cloudflared(download: bool = True, on_status=None) -> str | None:
    """Где cloudflared: рядом с exe (в архиве), в LOCALAPPDATA/Sherpa/bin, в PATH — иначе скачиваем с официального релиза."""
    candidates = [
        ROOT / "cloudflared.exe",
        Path(getattr(sys, "_MEIPASS", ROOT)) / "bin" / "cloudflared.exe",
        ROOT / "launcher" / "bin" / "cloudflared.exe",
        Path(os.environ.get("LOCALAPPDATA", str(ROOT))) / "Sherpa" / "bin" / "cloudflared.exe",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    found = shutil.which("cloudflared")
    if found:
        return found
    if not download:
        return None
    dest = candidates[-1]
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if on_status:
            on_status("downloading")
        print(f"[sherpa] качаю cloudflared с {CLOUDFLARED_URL} …")
        tmp = dest.with_suffix(".part")
        with urllib.request.urlopen(urllib.request.Request(CLOUDFLARED_URL, headers={"User-Agent": TT_UA}), timeout=60) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f)
        os.replace(tmp, dest)
        print(f"[sherpa] cloudflared сохранён: {dest}")
        return str(dest)
    except Exception as e:  # noqa: BLE001
        print(f"[sherpa] не удалось скачать cloudflared: {e}")
        return None


_JOB = None


def _bind_to_job(proc: subprocess.Popen) -> None:
    """Job-объект с KILL_ON_JOB_CLOSE: cloudflared умрёт вместе с лаунчером, даже если тот упал или его сняли из диспетчера."""
    global _JOB
    try:
        k32 = ctypes.windll.kernel32
        if _JOB is None:
            _JOB = k32.CreateJobObjectW(None, None)

            class _Limit(ctypes.Structure):
                _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                            ("LimitFlags", wt.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t), ("MaximumWorkingSetSize", ctypes.c_size_t),
                            ("ActiveProcessLimit", wt.DWORD), ("Affinity", ctypes.c_size_t), ("PriorityClass", wt.DWORD), ("SchedulingClass", wt.DWORD)]

            class _IoCounters(ctypes.Structure):
                _fields_ = [(n, ctypes.c_uint64) for n in ("ReadOperationCount", "WriteOperationCount", "OtherOperationCount", "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

            class _Ext(ctypes.Structure):
                _fields_ = [("BasicLimitInformation", _Limit), ("IoInfo", _IoCounters), ("ProcessMemoryLimit", ctypes.c_size_t),
                            ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]
            info = _Ext()
            info.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            k32.SetInformationJobObject(_JOB, 9, ctypes.byref(info), ctypes.sizeof(info))  # JobObjectExtendedLimitInformation
        k32.AssignProcessToJobObject(_JOB, wt.HANDLE(proc._handle))  # type: ignore[attr-defined]
    except Exception as e:  # noqa: BLE001
        print(f"[sherpa] job object: {e}")


def start_tunnel(port: int, on_url, on_status=None) -> subprocess.Popen | None:
    """cloudflared quick tunnel: публичный https-адрес без аккаунта."""
    exe = find_cloudflared(download=True, on_status=on_status)
    if not exe:
        print("[sherpa] cloudflared недоступен — проверь интернет или положи cloudflared.exe рядом с Sherpa.exe")
        return None
    try:
        proc = subprocess.Popen(
            [exe, "tunnel", "--url", f"http://127.0.0.1:{port}", "--no-autoupdate"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception as e:  # noqa: BLE001
        print(f"[sherpa] не удалось запустить cloudflared: {e}")
        return None
    _bind_to_job(proc)

    def reader():
        # адрес печатается раньше, чем туннель реально подключён — отдаём его после «Registered tunnel connection»
        url = None
        for line in proc.stdout or []:
            m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
            if m and not url:
                url = m.group(0)
            if url and "Registered tunnel connection" in line:
                on_url(url)
                url = None  # переподключения не дёргают состояние повторно
            if " ERR " in line or " WRN " in line:
                print("[cloudflared] " + line.strip()[:300])
    threading.Thread(target=reader, daemon=True).start()
    return proc


def webview2_installed() -> bool:
    """Проверка Evergreen Runtime по реестру (как рекомендует Microsoft)."""
    try:
        import winreg
    except ImportError:
        return True
    keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
    ]
    for hive, path in keys:
        try:
            with winreg.OpenKey(hive, path) as k:
                ver, _ = winreg.QueryValueEx(k, "pv")
                if ver and ver != "0.0.0.0":
                    return True
        except OSError:
            continue
    return False


def lan_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:  # noqa: BLE001
        return None


def timed(fn):
    """Отладка: пишем в лог каждый вызов API из страницы и его длительность."""
    def wrap(self, *args, **kw):
        t0 = time.perf_counter()
        try:
            return fn(self, *args, **kw)
        finally:
            if os.environ.get("SHERPA_DEBUG"):
                print(f"[api] {fn.__name__}{args} {1000 * (time.perf_counter() - t0):.1f} ms  thread={threading.current_thread().name}")
    wrap.__name__ = fn.__name__
    return wrap


class Api:
    """Мост для страницы: window.pywebview.api.*"""

    def __init__(self):
        # всё состояние — с подчёркиванием: pywebview обходит публичные атрибуты js_api
        self._window = None
        self._on_top = True
        self._visible = True
        self._hwnd = None

    # ── служебное ──
    def _hwnd_get(self):
        if self._hwnd:
            return self._hwnd
        try:
            self._hwnd = int(self._window.native.Handle.ToInt64())  # WinForms
        except Exception:  # noqa: BLE001
            self._hwnd = user32.FindWindowW(None, "Sherpa")
        return self._hwnd

    # ── вызывается со страницы ──
    @timed
    def set_opacity(self, value: float):
        """Прозрачность окна отключена: WebView2 не работает в слоистых (WS_EX_LAYERED) окнах — зависает.
        Оставлено как no-op, чтобы старые страницы не падали на вызове."""
        return None

    @timed
    def set_on_top(self, value: bool):
        self._on_top = bool(value)
        self._apply_on_top()
        return self._on_top

    def _apply_on_top(self):
        """pywebview ставит Form.TopMost прямо из потока вызова API — WinForms от этого виснет.
        Делаем то же самое, но в UI-потоке через BeginInvoke (не ждём ответа, дедлок невозможен)."""
        w = self._window
        if not w:
            return
        v = self._on_top
        try:
            from System import Action  # pythonnet, уже загружен pywebview
            form = w.native

            def _apply():
                form.TopMost = v
            form.BeginInvoke(Action(_apply))
        except Exception:  # noqa: BLE001
            try:
                w.on_top = v
            except Exception:  # noqa: BLE001
                pass

    _lan_url: str | None = None
    _lan_server = None
    _tunnel_proc = None
    _mini = None  # окно мини-карты
    _mapwin = None  # отдельное окно карты (F7)
    _mapwin_visible = True
    _cfg: dict = {}
    _port: int = 4879
    _tunnel_url: str | None = None
    _tunnel_state: str = "off"  # off | starting | up | missing
    # обновления
    _update: dict | None = None            # найденная новая версия (см. fetch_latest_release)
    _update_state: dict = {"stage": "idle"}  # idle | checking | downloading | extracting | restarting | error
    _update_checked: float = 0.0

    @timed
    def get_state(self):
        return {
            "version": APP_VERSION,
            "on_top": self._on_top, "visible": self._visible,
            "screenshots": self._shots_enabled, "screenshots_path": str(self._shots_path or ""),
            "screenshots_path_exists": bool(self._shots_path and self._shots_path.exists()),
            "lan_url": self._lan_url,
            "tunnel_url": self._tunnel_url, "tunnel_state": self._tunnel_state,
            "minimap_opacity": float(self._cfg.get("minimap_opacity", 1.0) or 1.0),
            "map_opacity": float(self._cfg.get("map_opacity", 1.0) or 1.0),
            "mapwin_open": self._mapwin is not None,
        }

    # ── «ты здесь» по скриншотам ──
    _shots_enabled = False
    _shots_path: Path | None = None
    _shots_seen: float = 0.0

    @timed
    def set_screenshot_watch(self, value: bool):
        self._shots_enabled = bool(value)
        if self._shots_enabled and not self._shots_path:
            self._shots_path = default_screenshots_path()
        return self.get_state()

    @timed
    def set_screenshots_path(self, path: str = ""):
        """Папка скриншотов вручную (пусто — автоопределение). Сохраняется в config.json."""
        p = (path or "").strip().strip('"')
        self._shots_path = Path(p).expanduser() if p else default_screenshots_path()
        self._shots_seen = 0.0  # новую папку читаем с самого свежего файла
        self._save_cfg(screenshots_path=p)
        print(f"[sherpa] папка скриншотов: {self._shots_path} ({'есть' if self._shots_path.exists() else 'не найдена'})")
        return self.get_state()

    def _cleanup_screenshots(self):
        """Удаляем старые скриншоты Sherpa-формата, оставляя последние screenshots_keep. Только .png с координатами в имени."""
        keep = int(self._cfg.get("screenshots_keep", 0) or 0)
        if keep <= 0 or not self._shots_path:
            return
        try:
            files = []
            with os.scandir(self._shots_path) as it:
                for e in it:
                    if e.is_file() and e.name.lower().endswith(".png") and _SHOT_RE.search(e.name):
                        files.append((e.stat().st_mtime, e.path))
            files.sort(reverse=True)
            for _, path in files[keep:]:
                try:
                    os.remove(path)
                except OSError:
                    pass
        except OSError:
            pass

    def _poll_screenshots(self):
        """Раз в секунду смотрим новейший .png; координаты берём из имени файла."""
        while True:
            try:
                if self._shots_enabled and self._shots_path and self._shots_path.exists():
                    newest = None
                    # scandir отдаёт mtime из листинга — без отдельного stat на каждый из тысяч файлов
                    with os.scandir(self._shots_path) as it:
                        for entry in it:
                            if not entry.name.lower().endswith(".png") or not entry.is_file():
                                continue
                            m = entry.stat().st_mtime
                            if m > self._shots_seen and (newest is None or m > newest[0]):
                                newest = (m, entry.name)
                    if newest:
                        self._shots_seen = newest[0]
                        self._cleanup_screenshots()
                        pos = parse_screenshot_name(newest[1])
                        if pos:
                            publish_pos(pos)
                            # во все окна: главное и мини-карту
                            for w in [self._window, self._mini, self._mapwin]:
                                if w is None:
                                    continue
                                try:
                                    w.evaluate_js(f"window.dispatchEvent(new CustomEvent('sherpa:pos', {{detail: {json.dumps(pos)}}}))")
                                except Exception:  # noqa: BLE001
                                    pass
            except Exception:  # noqa: BLE001
                pass
            threading.Event().wait(1.0)

    # ── обновления ──
    def update_info(self):
        return {"version": APP_VERSION, "update": self._update, "state": self._update_state, "checked_at": self._update_checked, "can_install": FROZEN, "page": UPDATE_PAGE}

    def _push_update(self):
        info = self.update_info()
        for w in [self._window]:
            if w is None:
                continue
            try:
                w.evaluate_js(f"window.dispatchEvent(new CustomEvent('sherpa:update', {{detail: {json.dumps(info, ensure_ascii=False)}}}))")
            except Exception:  # noqa: BLE001
                pass

    def _set_update_state(self, **kv):
        self._update_state = dict(kv)
        self._push_update()

    def _check_update(self):
        try:
            self._update_state = {"stage": "checking"}
            rel = fetch_latest_release()
            self._update_checked = time.time()
            if rel and version_tuple(rel["version"]) > version_tuple(APP_VERSION):
                self._update = rel
                print(f"[sherpa] есть обновление: {rel['version']} (сейчас {APP_VERSION})")
            else:
                self._update = None
            self._update_state = {"stage": "idle"}
        except Exception as e:  # noqa: BLE001
            print(f"[sherpa] проверка обновлений: {e}")
            self._update_state = {"stage": "error", "error": f"не удалось проверить: {e}"}
        self._push_update()

    def _update_loop(self):
        time.sleep(15)  # не мешаем старту
        while True:
            self._check_update()
            time.sleep(UPDATE_CHECK_EVERY)

    @timed
    def check_update(self):
        threading.Thread(target=self._check_update, daemon=True).start()
        return self.update_info()

    @timed
    def install_update(self):
        """Скачать архив релиза, распаковать и перезапуститься через внешний скрипт (файлы exe заняты, пока он работает)."""
        if not FROZEN:
            return {"ok": False, "error": "обновление ставится только в собранной Sherpa.exe"}
        if not self._update:
            return {"ok": False, "error": "обновления нет"}
        if self._update_state.get("stage") in ("downloading", "extracting", "restarting"):
            return {"ok": True}
        threading.Thread(target=self._install_update, daemon=True).start()
        return {"ok": True}

    def _install_update(self):
        upd = self._update
        base = Path(os.environ.get("LOCALAPPDATA", str(ROOT))) / "Sherpa" / "update"
        try:
            shutil.rmtree(base, ignore_errors=True)
            base.mkdir(parents=True, exist_ok=True)
            zip_path = base / f"Sherpa-{upd['version']}.zip"
            self._set_update_state(stage="downloading", done=0, total=upd["size"])
            req = urllib.request.Request(upd["url"], headers={"User-Agent": TT_UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(zip_path, "wb") as f:
                total = int(r.headers.get("Content-Length") or upd["size"] or 0)
                done, last = 0, 0.0
                while True:
                    chunk = r.read(256 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    done += len(chunk)
                    if time.time() - last > 0.3:
                        self._set_update_state(stage="downloading", done=done, total=total)
                        last = time.time()
            self._set_update_state(stage="extracting")
            import zipfile
            new_dir = base / "new"
            with zipfile.ZipFile(zip_path) as z:
                z.extractall(new_dir)
            if not (new_dir / "Sherpa.exe").exists():
                # архив с папкой Sherpa внутри
                inner = next((d for d in new_dir.iterdir() if d.is_dir() and (d / "Sherpa.exe").exists()), None)
                if inner is None:
                    raise RuntimeError("в архиве нет Sherpa.exe")
                new_dir = inner
            script = Path(os.environ.get("TEMP", str(base))) / "sherpa-update.ps1"
            q = lambda v: str(v).replace("'", "''")  # noqa: E731
            script.write_text(UPDATE_SCRIPT.format(pid=os.getpid(), src=q(new_dir), dst=q(ROOT), upd=q(base)), encoding="utf-8-sig")
            # CREATE_NO_WINDOW, но не DETACHED_PROCESS: без консоли PowerShell умирает сразу (проверено)
            flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200) | 0x08000000
            subprocess.Popen(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", str(script)],
                creationflags=flags, close_fds=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            print(f"[sherpa] обновление {upd['version']} скачано, перезапуск")
            self._set_update_state(stage="restarting")
            time.sleep(0.6)
            self._quit()
        except Exception as e:  # noqa: BLE001
            print(f"[sherpa] обновление не удалось: {e}")
            self._set_update_state(stage="error", error=str(e), page=upd.get("page") if upd else UPDATE_PAGE)

    def _quit(self):
        """Закрыть все окна — webview.start() вернётся, main() погасит туннель. Если окно не закрылось — выходим жёстко."""
        self.close_minimap()
        self.close_mapwin()
        w = self._window
        try:
            if w is not None:
                w.destroy()
        except Exception:  # noqa: BLE001
            pass

        def hard():
            time.sleep(4)
            try:
                if self._tunnel_proc is not None:
                    self._tunnel_proc.terminate()
            except Exception:  # noqa: BLE001
                pass
            os._exit(0)
        threading.Thread(target=hard, daemon=True).start()

    @timed
    def open_url(self, url: str):
        """Открыть ссылку в системном браузере (из WebView2 внешние ссылки открывать нечем)."""
        if not str(url).startswith(("http://", "https://")):
            return False
        try:
            os.startfile(url)  # noqa: S606
            return True
        except Exception:  # noqa: BLE001
            return False

    # ── сеть для сквада: включается из интерфейса, без перезапуска ──
    def _save_cfg(self, **kv):
        try:
            self._cfg.update(kv)
            CONFIG_PATH.write_text(json.dumps({k: v for k, v in self._cfg.items()}, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

    @timed
    def enable_lan(self, on: bool = True):
        """Доступ по локальной сети. Основной сервер слушает 127.0.0.1, поэтому для сети поднимаем второй на порту +1."""
        if on and not self._lan_url:
            ip = lan_ip()
            port = self._port + 1
            if self._lan_server is None:
                try:
                    self._lan_server = serve(port, "0.0.0.0")
                except OSError as e:
                    print(f"[sherpa] LAN: не удалось занять порт {port}: {e}")
                    return self.get_state()
            self._lan_url = f"http://{ip}:{port}/" if ip else None
            print(f"[sherpa] доступ по сети: {self._lan_url}")
        if not on and self._lan_server is not None:
            try:
                self._lan_server.shutdown()
            except Exception:  # noqa: BLE001
                pass
            self._lan_server = None
            self._lan_url = None
        self._save_cfg(lan=bool(on))
        return self.get_state()

    @timed
    def enable_tunnel(self, on: bool = True):
        """Публичный адрес через cloudflared — для сквада через интернет."""
        if on and self._tunnel_proc is None and self._tunnel_state not in ("up", "starting", "downloading"):
            def got_url(url: str):
                self._tunnel_url = url
                self._tunnel_state = "up"
                print(f"[sherpa] адрес для друзей: {url}")

            def status(st: str):
                self._tunnel_state = st

            def run():
                # скачивание (~55 МБ) и запуск — в фоне, чтобы не держать вызов со страницы
                proc = start_tunnel(self._port, got_url, on_status=status)
                if proc is None:
                    self._tunnel_state = "missing"
                else:
                    self._tunnel_proc = proc
                    if self._tunnel_state == "downloading":
                        self._tunnel_state = "starting"
            self._tunnel_state = "starting"
            threading.Thread(target=run, daemon=True).start()
        if not on and self._tunnel_proc is not None:
            try:
                self._tunnel_proc.terminate()
            except Exception:  # noqa: BLE001
                pass
            self._tunnel_proc = None
            self._tunnel_url = None
            self._tunnel_state = "off"
        self._save_cfg(squad_tunnel=bool(on))
        return self.get_state()

    # ── прозрачность окон мини-карты и карты ──
    def _apply_opacity(self, win, value: float):
        """Form.Opacity = WS_EX_LAYERED с альфой. WebView2 в таком окне рисуется и не виснет — если ставить из UI-потока
        (раньше «зависание в слоистых окнах» было из-за вызова из потока API)."""
        v = max(0.2, min(1.0, float(value)))
        if win is None:
            return
        try:
            from System import Action
            form = win.native

            def _set():
                form.Opacity = v
            form.BeginInvoke(Action(_set))
        except Exception as e:  # noqa: BLE001
            print(f"[sherpa] прозрачность окна: {e}")

    @timed
    def set_minimap_opacity(self, value: float):
        v = max(0.2, min(1.0, float(value)))
        self._save_cfg(minimap_opacity=v)
        self._apply_opacity(self._mini, v)
        return v

    @timed
    def set_map_opacity(self, value: float):
        v = max(0.2, min(1.0, float(value)))
        self._save_cfg(map_opacity=v)
        self._apply_opacity(self._mapwin, v)
        return v

    # ── отдельное окно карты поверх игры (F7): обычное окно с рамкой, только раздел «Карты» ──
    @timed
    def open_mapwin(self):
        import webview
        if self._mapwin is not None:
            if not self._mapwin_visible:
                self._mapwin.show()
                self._mapwin_visible = True
            return True
        w = int(self._cfg.get("map_width", 960) or 960)
        h = int(self._cfg.get("map_height", 680) or 680)
        win = webview.create_window(
            "Sherpa — карта", f"http://127.0.0.1:{self._port}/#/mapwin",
            width=w, height=h, on_top=True, resizable=True, min_size=(480, 360),
            background_color="#111310", js_api=self, text_select=False,
        )
        self._mapwin = win
        self._mapwin_visible = True
        opacity = float(self._cfg.get("map_opacity", 1.0) or 1.0)

        def shown():
            if opacity < 1.0:
                self._apply_opacity(win, opacity)
        win.events.shown += shown

        def closed():
            self._mapwin = None
            self._mapwin_visible = True
        win.events.closed += closed
        return True

    @timed
    def close_mapwin(self):
        w = self._mapwin
        self._mapwin = None
        if w is not None:
            try:
                w.destroy()
            except Exception:  # noqa: BLE001
                pass
        return False

    @timed
    def toggle_mapwin(self):
        """Хоткей: первый раз — открыть, потом показать/скрыть (окно живёт, чтобы не грузить карту заново)."""
        if self._mapwin is None:
            return self.open_mapwin()
        if self._mapwin_visible:
            self._mapwin.hide()
            self._mapwin_visible = False
            return False
        self._mapwin.show()
        self._mapwin_visible = True
        return True

    # ── мини-карта: отдельное окно без рамки, поверх игры, справа сверху ──
    def open_minimap(self):
        import webview
        if self._mini is not None:
            return
        size = int(self._cfg.get("minimap_size", 320))
        margin = int(self._cfg.get("minimap_margin", 16))
        try:
            scr = webview.screens[0]
            x = int(scr.width) - size - margin
        except Exception:  # noqa: BLE001
            x = 1600 - size - margin
        win = webview.create_window(
            "Sherpa Mini", f"http://127.0.0.1:{self._port}/#/mini",
            # pywebview считает размер как клиентский и потом «снимает» рамку — компенсируем стандартную рамку Windows
            x=x, y=margin, width=size + 16, height=size + 39,
            frameless=True, easy_drag=True, on_top=True, focus=False, resizable=True, min_size=(160, 160),
            background_color="#0d0f0c", js_api=self,
        )
        self._mini = win
        opacity = float(self._cfg.get("minimap_opacity", 1.0) or 1.0)

        def shown():
            if opacity < 1.0:
                self._apply_opacity(win, opacity)
        win.events.shown += shown

        def closed():
            self._mini = None
        win.events.closed += closed

    def save_file(self, name: str, text: str):
        """«Экспорт профиля»: WebView2 не качает blob-ссылки — показываем «Сохранить как» и пишем файл сами.
        Диалог WinForms — только в UI-потоке (через Invoke, ждём результата), из потока API он виснет.
        Возвращает путь или None (отмена)."""
        w = self._window
        if w is None:
            return None
        try:
            import System.Windows.Forms as WinForms  # pythonnet, уже загружен pywebview
            form = w.native
            res: list[str] = []

            def _show():
                dlg = WinForms.SaveFileDialog()
                dlg.Filter = "Профиль Sherpa (*.json)|*.json|Все файлы (*.*)|*.*"
                dlg.FileName = str(name)
                dlg.InitialDirectory = str(Path.home() / "Downloads")
                dlg.RestoreDirectory = True
                if dlg.ShowDialog(form) == WinForms.DialogResult.OK:
                    res.append(str(dlg.FileName))
            form.Invoke(WinForms.MethodInvoker(_show))  # ждём: модальный диалог крутит цикл сообщений в UI-потоке
            path = res[0] if res else ""
        except Exception as e:  # noqa: BLE001
            print(f"[sherpa] save dialog: {e}")
            return None
        if not path:
            return None
        Path(str(path)).write_text(text, encoding="utf-8")
        print(f"[sherpa] экспорт профиля: {path}")
        return str(path)

    def close_minimap(self):
        w = self._mini
        self._mini = None
        if w is not None:
            try:
                w.destroy()
            except Exception:  # noqa: BLE001
                pass

    @timed
    def toggle_minimap(self):
        if self._mini is None:
            self.open_minimap()
            return True
        self.close_minimap()
        return False

    # ── хоткеи ──
    def toggle_visible(self):
        if not self._window:
            return
        if self._visible:
            self._window.hide()
        else:
            self._window.show()
        self._visible = not self._visible

    def toggle_on_top(self):
        self.set_on_top(not self._on_top)
        try:
            self._window.evaluate_js(
                f"window.dispatchEvent(new CustomEvent('sherpa:ontop', {{detail: {str(self._on_top).lower()}}}))"
            )
        except Exception:  # noqa: BLE001
            pass


def documents_dirs() -> list[Path]:
    """Настоящая папка «Документы»: у многих она перенесена в OneDrive («Документы»), а не C:\\Users\\…\\Documents."""
    out: list[Path] = []
    try:
        # SHGetKnownFolderPath(FOLDERID_Documents) — то, куда Таркову реально пишет Windows
        import uuid
        buf = ctypes.c_wchar_p()
        fid = (ctypes.c_ubyte * 16).from_buffer_copy(uuid.UUID("FDD39AD0-238F-46AF-ADB4-6C85480369C7").bytes_le)
        if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(fid), 0, None, ctypes.byref(buf)) == 0 and buf.value:
            out.append(Path(buf.value))
            ctypes.windll.ole32.CoTaskMemFree(buf)
    except Exception:  # noqa: BLE001
        pass
    home = Path(os.environ.get("USERPROFILE", "~")).expanduser()
    for d in (home / "Documents", home / "OneDrive" / "Documents", home / "OneDrive" / "Документы"):
        if d not in out:
            out.append(d)
    return out


def default_screenshots_path() -> Path:
    for docs in documents_dirs():
        for name in ("Escape from Tarkov", "Escape From Tarkov"):
            p = docs / name / "Screenshots"
            if p.exists():
                return p
    return documents_dirs()[0] / "Escape from Tarkov" / "Screenshots"


_SHOT_RE = re.compile(r"\d{4}-\d{2}-\d{2}\[\d{2}-\d{2}\]_?(?P<pos>.+) \(\d+\)\.png$")
_POS_RE = re.compile(
    r"(?P<x>-?\d+\.\d+), (?P<y>-?\d+\.\d+), (?P<z>-?\d+\.\d+)_?"
    r"(?P<rx>-?\d\.\d+), (?P<ry>-?\d\.\d+), (?P<rz>-?\d\.\d+), (?P<rw>-?\d\.\d+)"
)


def parse_screenshot_name(name: str) -> dict | None:
    """Имя скриншота Таркова содержит позицию и кватернион поворота — так же читает TarkovMonitor."""
    m = _SHOT_RE.search(name)
    if not m:
        return None
    p = _POS_RE.search(m.group("pos"))
    if not p:
        return None
    x, y, z = (float(p.group(k)) for k in ("x", "y", "z"))
    rx, ry, rz, rw = (float(p.group(k)) for k in ("rx", "ry", "rz", "rw"))
    # yaw по формуле TarkovMonitor (оси y/z в кватернионе поменяны местами)
    qx, qz, qy, qw = rx, ry, rz, rw
    yaw = math.degrees(math.atan2(2.0 * (qw * qz + qx * qy), 1.0 - 2.0 * (qy * qy + qz * qz)))
    return {"x": x, "y": y, "z": z, "rotation": yaw, "file": name, "ts": int(time.time() * 1000)}


def install_dotnet_handlers():
    """Исключение .NET в UI-потоке WinForms по умолчанию закрывает приложение (или показывает диалог «Continue/Quit»).
    Ловим и пишем в лог — окно живёт дальше. Исключения в других потоках хотя бы попадут в лог перед смертью.
    Вызывать после старта окна: WinForms подгружает pywebview (clr.AddReference) при запуске."""
    try:
        import clr  # noqa: F401  (pythonnet, уже загружен pywebview)
        clr.AddReference('System.Windows.Forms')
        import System
        import System.Windows.Forms as WinForms

        def on_thread_exc(sender, args):
            try:
                print(f"[sherpa] .NET-исключение в UI-потоке (перехвачено): {args.Exception}")
            except Exception:  # noqa: BLE001
                pass

        def on_unhandled(sender, args):
            try:
                print(f"[sherpa] необработанное .NET-исключение (процесс завершается): {args.ExceptionObject}")
                sys.stdout.flush()
            except Exception:  # noqa: BLE001
                pass

        WinForms.Application.ThreadException += System.Threading.ThreadExceptionEventHandler(on_thread_exc)
        System.AppDomain.CurrentDomain.UnhandledException += System.UnhandledExceptionEventHandler(on_unhandled)
        print("[sherpa] обработчики исключений .NET установлены")
    except Exception as e:  # noqa: BLE001
        print(f"[sherpa] обработчики .NET не установлены: {e}")


def watch_webview_process(window):
    """Крах процесса рендера WebView2 (нехватка памяти, GPU) оставлял пустое окно. Ловим ProcessFailed:
    рендер упал — перезагружаем страницу, упал сам браузерный процесс — пишем в лог (окно придётся открыть заново)."""
    try:
        from webview.platforms.winforms import BrowserView
        form = BrowserView.instances.get(window.uid)
        wv = getattr(getattr(form, "browser", None), "webview", None)
        if form is None or wv is None:
            return
        from System import Action

        def hook():
            try:
                core = wv.CoreWebView2
                if core is None:
                    return

                def on_failed(sender, args):
                    try:
                        kind = str(args.ProcessFailedKind)
                        reason = str(getattr(args, "Reason", ""))
                        print(f"[sherpa] WebView2 ProcessFailed: {kind} reason={reason} exit={getattr(args, 'ExitCode', '')} {getattr(args, 'ProcessDescription', '')}")
                        if kind in ("RenderProcessExited", "RenderProcessUnresponsive", "FrameRenderProcessExited"):
                            def reload():
                                try:
                                    wv.CoreWebView2.Reload()
                                    print("[sherpa] страница перезагружена после краха рендера")
                                except Exception as e:  # noqa: BLE001
                                    print(f"[sherpa] перезагрузка после краха: {e}")
                            threading.Timer(1.0, lambda: form.BeginInvoke(Action(reload))).start()
                    except Exception as e:  # noqa: BLE001
                        print(f"[sherpa] ProcessFailed handler: {e}")

                import Microsoft.Web.WebView2.Core as Core
                core.ProcessFailed += System.EventHandler[Core.CoreWebView2ProcessFailedEventArgs](on_failed)
                print("[sherpa] слежение за процессами WebView2 включено")
            except Exception as e:  # noqa: BLE001
                print(f"[sherpa] ProcessFailed не подключён: {e}")
        import System  # noqa: F811
        form.BeginInvoke(Action(hook))
    except Exception as e:  # noqa: BLE001
        print(f"[sherpa] watch_webview_process: {e}")


def hotkey_loop(api: Api, cfg: dict):
    """Отдельный поток с очередью сообщений Windows для RegisterHotKey."""
    ids = {}
    for hid, key in ((1, cfg["hotkey_toggle"]), (2, cfg["hotkey_on_top"]), (3, cfg.get("hotkey_minimap", "F8")), (4, cfg.get("hotkey_map", "F7"))):
        vk = VK.get(str(key).upper())
        if not vk:
            print(f"[sherpa] неизвестная клавиша '{key}', допустимы F1–F24, INSERT, HOME, END, PAUSE, SCROLL")
            continue
        if user32.RegisterHotKey(None, hid, MOD_NOREPEAT, vk):
            ids[hid] = key
        else:
            print(f"[sherpa] не удалось занять {key} — возможно, её держит другая программа")
    if not ids:
        return
    names = {1: "показать/скрыть", 2: "поверх окон", 3: "мини-карта", 4: "окно карты"}
    print("[sherpa] хоткеи: " + ", ".join(f"{k} — {names.get(i, '')}" for i, k in ids.items()))
    msg = wt.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
        if msg.message == WM_HOTKEY:
            if msg.wParam == 1:
                api.toggle_visible()
            elif msg.wParam == 2:
                api.toggle_on_top()
            elif msg.wParam == 3:
                api.toggle_minimap()
            elif msg.wParam == 4:
                try:
                    api.toggle_mapwin()
                except Exception as e:  # noqa: BLE001
                    print(f"[sherpa] окно карты: {e}")
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))


def main():
    try:
        import webview  # pywebview
    except ImportError:
        print("Нужен pywebview:  pip install pywebview")
        sys.exit(1)
    if FROZEN and not webview2_installed():
        ctypes.windll.user32.MessageBoxW(
            None,
            "Sherpa открывается в окне Microsoft Edge WebView2, а его нет в системе.\n"
            "Скачай и установи Evergreen Runtime: https://developer.microsoft.com/microsoft-edge/webview2/\n"
            "После установки запусти Sherpa снова.",
            "Sherpa — нужен WebView2", 0x30,
        )
        sys.exit(2)

    if not (DIST / "index.html").exists():
        print("Нет сборки. Сначала выполни:  npm run build")
        sys.exit(1)

    cfg = load_config()
    port = int(cfg["port"])
    lan = bool(cfg.get("lan"))
    lan_url = None
    if not port_free(port):
        if is_sherpa_server(port):
            # уже поднят dev-сервер или прошлый запуск — просто откроем его
            print(f"[sherpa] порт {port} занят Sherpa, подключаюсь к нему")
        else:
            # порт занят чужой программой — иначе окно откроет пустую страницу
            busy = port
            port = next((p for p in range(busy + 10, busy + 40) if port_free(p)), busy)
            print(f"[sherpa] порт {busy} занят другой программой — использую {port}")
            serve(port, "0.0.0.0" if lan else "127.0.0.1")
    else:
        serve(port, "0.0.0.0" if lan else "127.0.0.1")
        if lan:
            ip = lan_ip()
            if ip:
                lan_url = f"http://{ip}:{port}/"
                print(f"[sherpa] доступ по сети: {lan_url}  (телефон в той же Wi-Fi; Windows может спросить про брандмауэр)")

    # отметка «работаю»: если файл остался с прошлого запуска — тот раз завершился аварийно, пишем это в лог
    running_marker = ROOT / ".running"
    try:
        if running_marker.exists():
            print(f"[sherpa] прошлый запуск завершился аварийно (без штатного выхода) — {running_marker.stat().st_mtime and time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(running_marker.stat().st_mtime))}")
        running_marker.write_text(str(os.getpid()), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

    api = Api()
    global DEBUG_API
    DEBUG_API = api
    api._lan_url = lan_url
    api._cfg = cfg
    api._port = port
    if cfg.get("squad_tunnel"):
        api.enable_tunnel(True)
    api._on_top = bool(cfg["on_top"])
    api._shots_enabled = bool(cfg.get("screenshots_watch"))
    api._shots_path = Path(cfg["screenshots_path"]) if cfg.get("screenshots_path") else default_screenshots_path()
    print(f"[sherpa] папка скриншотов: {api._shots_path} ({'есть' if api._shots_path.exists() else 'не найдена — укажи в панели «Ты здесь»'})")
    api._shots_seen = time.time()  # старые скриншоты не считаем
    threading.Thread(target=api._poll_screenshots, daemon=True).start()
    if FROZEN:
        threading.Thread(target=api._update_loop, daemon=True).start()
    print(f"[sherpa] версия {APP_VERSION}")
    window = webview.create_window(
        "Sherpa",
        f"http://127.0.0.1:{port}/",
        width=int(cfg["width"]),
        height=int(cfg["height"]),
        on_top=bool(cfg["on_top"]),
        background_color="#111310",
        js_api=api,
        text_select=False,
    )
    api._window = window

    # сторож: если страница не сообщила о загрузке за 12 с — перезагружаем адрес (в UI-потоке, как и всё окно)
    loaded = threading.Event()
    try:
        hooked = []

        def on_loaded():
            loaded.set()
            # один раз, когда CoreWebView2 уже создан (в shown его ещё нет)
            if not hooked:
                hooked.append(True)
                install_dotnet_handlers()
                watch_webview_process(window)
        window.events.loaded += on_loaded
    except Exception:  # noqa: BLE001
        pass

    def boot_watchdog():
        url = f"http://127.0.0.1:{port}/"
        for attempt in range(3):
            if loaded.wait(12):
                return
            print(f"[sherpa] окно не загрузилось за 12 с — повторяю ({attempt + 1}/3)")
            try:
                from System import Action
                window.native.BeginInvoke(Action(lambda: window.load_url(url)))
            except Exception as e:  # noqa: BLE001
                print(f"[sherpa] не удалось перезагрузить окно: {e}")
    threading.Thread(target=boot_watchdog, daemon=True).start()

    threading.Thread(target=hotkey_loop, args=(api, cfg), daemon=True).start()
    # профиль WebView2 (localStorage/IndexedDB с прогрессом) — в AppData, а не в папке проекта
    storage = Path(os.environ.get("LOCALAPPDATA", str(ROOT))) / "Sherpa" / "webview"
    storage.mkdir(parents=True, exist_ok=True)
    webview.start(private_mode=False, storage_path=str(storage))
    # окно закрыто — гасим туннель и LAN-сервер, чтобы не висели в фоне
    # (настройки не трогаем — при следующем запуске поднимутся снова)
    try:
        if api._tunnel_proc is not None:
            api._tunnel_proc.terminate()
    except Exception:  # noqa: BLE001
        pass
    try:
        running_marker.unlink(missing_ok=True)
        print(f"[sherpa] выход {time.strftime('%Y-%m-%d %H:%M:%S')}")
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    os.chdir(ROOT)
    if FROZEN:
        # окно без консоли — пишем в sherpa.log рядом с exe
        try:
            log_path = ROOT / "sherpa.log"
            if log_path.exists() and log_path.stat().st_size > 512 * 1024:
                # держим лог компактным: оставляем последние 128 КБ
                tail = log_path.read_bytes()[-128 * 1024:]
                log_path.write_bytes(tail)
            log = open(log_path, "a", encoding="utf-8", buffering=1)
            sys.stdout = sys.stderr = log
            print(f"\n[sherpa] запуск {time.strftime('%Y-%m-%d %H:%M:%S')}")
            if os.environ.get("SHERPA_DEBUG"):
                import faulthandler
                faulthandler.dump_traceback_later(10, repeat=True, file=log)
        except Exception:  # noqa: BLE001
            pass
    else:
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass
    try:
        main()
    except Exception:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        if FROZEN:
            try:
                ctypes.windll.user32.MessageBoxW(None, "Sherpa не запустилась. Подробности — в sherpa.log рядом с Sherpa.exe.", "Sherpa", 0x10)
            except Exception:  # noqa: BLE001
                pass
        raise
