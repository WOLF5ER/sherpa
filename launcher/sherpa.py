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
    "opacity": 1.0,
    "hotkey_toggle": "F10",
    "hotkey_on_top": "F9",
    # «Ты здесь»: следить за папкой скриншотов игры (в имени файла — координаты). Выключено по умолчанию.
    "screenshots_watch": False,
    "screenshots_path": "",
    # доступ по локальной сети (телефон, второй монитор-планшет): слушать 0.0.0.0 вместо 127.0.0.1
    "lan": False,
    # сквад: поднять публичный адрес через cloudflared (winget install Cloudflare.cloudflared)
    "squad_tunnel": False,
}

# ── сквад: комнаты живут в памяти хоста, пока он запущен ──
SQUAD_ROOMS: dict[str, dict] = {}          # room → {name: {pos, map, ts}}
SQUAD_CLIENTS: dict[str, list[queue.Queue]] = {}
SQUAD_LOCK = threading.Lock()
SQUAD_TTL = 20 * 60  # участник без обновлений 20 минут выпадает


def squad_snapshot(room: str) -> dict:
    now = time.time()
    with SQUAD_LOCK:
        members = SQUAD_ROOMS.get(room, {})
        for name in [n for n, m in members.items() if now - m["ts"] > SQUAD_TTL]:
            del members[name]
        return {"room": room, "members": dict(members)}


def squad_publish(room: str, name: str, payload: dict):
    with SQUAD_LOCK:
        SQUAD_ROOMS.setdefault(room, {})[name] = {**payload, "ts": time.time()}
    snap = squad_snapshot(room)
    for q in list(SQUAD_CLIENTS.get(room, [])):
        try:
            q.put_nowait(snap)
        except Exception:  # noqa: BLE001
            pass

# последняя позиция и подписчики SSE — общие для HTTP-обработчика и окна
LAST_POS: dict | None = None
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


class QuietHandler(SimpleHTTPRequestHandler):
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
        m = re.match(r"^/api/squad/([A-Za-z0-9_-]{3,40})$", self.path)
        if not m:
            return self._json({"error": "not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            name = str(body.get("name") or "")[:24].strip() or "аноним"
            payload = {"pos": body.get("pos"), "map": str(body.get("map") or "")[:40], "online": bool(body.get("online", True))}
        except Exception:  # noqa: BLE001
            return self._json({"error": "bad json"}, 400)
        squad_publish(m.group(1), name, payload)
        return self._json({"ok": True})

    def _cors(self):
        # друзья заходят со своего localhost или туннеля — нужен CORS
        self.send_header("Access-Control-Allow-Origin", "*")

    def _sse_squad(self, room: str):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self._cors()
        self.end_headers()
        q: queue.Queue = queue.Queue()
        SQUAD_CLIENTS.setdefault(room, []).append(q)
        try:
            self.wfile.write(f"data: {json.dumps(squad_snapshot(room))}\n\n".encode())
            self.wfile.flush()
            while True:
                try:
                    snap = q.get(timeout=15)
                    self.wfile.write(f"data: {json.dumps(snap)}\n\n".encode())
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()
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
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        q: queue.Queue = queue.Queue()
        SSE_CLIENTS.append(q)
        try:
            if LAST_POS:
                self.wfile.write(f"data: {json.dumps(LAST_POS)}\n\n".encode())
                self.wfile.flush()
            while True:
                try:
                    pos = q.get(timeout=15)
                    self.wfile.write(f"data: {json.dumps(pos)}\n\n".encode())
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()
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


def serve(port: int, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    handler = partial(QuietHandler, directory=str(DIST))
    httpd = ThreadingHTTPServer((host, port), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def start_tunnel(port: int, on_url) -> subprocess.Popen | None:
    """cloudflared quick tunnel: публичный https-адрес без аккаунта. Нужен установленный cloudflared."""
    exe = shutil.which("cloudflared")
    if not exe:
        print("[sherpa] cloudflared не найден — для сквада через интернет установи:  winget install --id Cloudflare.cloudflared")
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

    def reader():
        for line in proc.stdout or []:
            m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
            if m:
                on_url(m.group(0))
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
    def set_opacity(self, value: float):
        try:
            v = max(0.3, min(1.0, float(value)))
        except (TypeError, ValueError):
            return
        hwnd = self._hwnd_get()
        if not hwnd:
            return
        style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED)
        user32.SetLayeredWindowAttributes(hwnd, 0, int(v * 255), LWA_ALPHA)

    def set_on_top(self, value: bool):
        self._on_top = bool(value)
        if self._window:
            self._window.on_top = self._on_top
        return self._on_top

    _lan_url: str | None = None
    _tunnel_url: str | None = None
    _tunnel_state: str = "off"  # off | starting | up | missing

    def get_state(self):
        return {
            "on_top": self._on_top, "visible": self._visible,
            "screenshots": self._shots_enabled, "screenshots_path": str(self._shots_path or ""),
            "lan_url": self._lan_url,
            "tunnel_url": self._tunnel_url, "tunnel_state": self._tunnel_state,
        }

    # ── «ты здесь» по скриншотам ──
    _shots_enabled = False
    _shots_path: Path | None = None
    _shots_seen: float = 0.0

    def set_screenshot_watch(self, value: bool):
        self._shots_enabled = bool(value)
        if self._shots_enabled and not self._shots_path:
            self._shots_path = default_screenshots_path()
        return self.get_state()

    def _poll_screenshots(self):
        """Раз в секунду смотрим новейший .png; координаты берём из имени файла."""
        while True:
            try:
                if self._shots_enabled and self._shots_path and self._shots_path.exists():
                    newest = None
                    for f in self._shots_path.glob("*.png"):
                        m = f.stat().st_mtime
                        if m > self._shots_seen and (newest is None or m > newest[0]):
                            newest = (m, f)
                    if newest:
                        self._shots_seen = newest[0]
                        pos = parse_screenshot_name(newest[1].name)
                        if pos:
                            publish_pos(pos)
                            if self._window:
                                self._window.evaluate_js(
                                    f"window.dispatchEvent(new CustomEvent('sherpa:pos', {{detail: {json.dumps(pos)}}}))"
                                )
            except Exception:  # noqa: BLE001
                pass
            threading.Event().wait(1.0)

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


def default_screenshots_path() -> Path:
    docs = Path(os.environ.get("USERPROFILE", "~")).expanduser() / "Documents"
    for name in ("Escape From Tarkov", "Escape from Tarkov"):
        p = docs / name / "Screenshots"
        if p.exists():
            return p
    return docs / "Escape From Tarkov" / "Screenshots"


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


def hotkey_loop(api: Api, cfg: dict):
    """Отдельный поток с очередью сообщений Windows для RegisterHotKey."""
    ids = {}
    for hid, key in ((1, cfg["hotkey_toggle"]), (2, cfg["hotkey_on_top"])):
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
    print("[sherpa] хоткеи: " + ", ".join(f"{k} — {'показать/скрыть' if i == 1 else 'поверх окон'}" for i, k in ids.items()))
    msg = wt.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
        if msg.message == WM_HOTKEY:
            if msg.wParam == 1:
                api.toggle_visible()
            elif msg.wParam == 2:
                api.toggle_on_top()
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
        # уже поднят dev-сервер или прошлый запуск — просто откроем его
        print(f"[sherpa] порт {port} занят, подключаюсь к нему")
    else:
        serve(port, "0.0.0.0" if lan else "127.0.0.1")
        if lan:
            ip = lan_ip()
            if ip:
                lan_url = f"http://{ip}:{port}/"
                print(f"[sherpa] доступ по сети: {lan_url}  (телефон в той же Wi-Fi; Windows может спросить про брандмауэр)")

    api = Api()
    api._lan_url = lan_url
    if cfg.get("squad_tunnel"):
        def got_url(url: str):
            api._tunnel_url = url
            api._tunnel_state = "up"
            print(f"[sherpa] адрес для друзей: {url}")
        api._tunnel_state = "starting"
        if start_tunnel(port, got_url) is None:
            api._tunnel_state = "missing"
    api._on_top = bool(cfg["on_top"])
    api._shots_enabled = bool(cfg.get("screenshots_watch"))
    api._shots_path = Path(cfg["screenshots_path"]) if cfg.get("screenshots_path") else default_screenshots_path()
    api._shots_seen = time.time()  # старые скриншоты не считаем
    threading.Thread(target=api._poll_screenshots, daemon=True).start()
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

    def on_loaded():
        api.set_opacity(float(cfg.get("opacity", 1.0)))

    window.events.loaded += on_loaded
    threading.Thread(target=hotkey_loop, args=(api, cfg), daemon=True).start()
    # профиль WebView2 (localStorage/IndexedDB с прогрессом) — в AppData, а не в папке проекта
    storage = Path(os.environ.get("LOCALAPPDATA", str(ROOT))) / "Sherpa" / "webview"
    storage.mkdir(parents=True, exist_ok=True)
    webview.start(private_mode=False, storage_path=str(storage))


if __name__ == "__main__":
    os.chdir(ROOT)
    if FROZEN:
        # окно без консоли — пишем в sherpa.log рядом с exe
        try:
            log = open(ROOT / "sherpa.log", "a", encoding="utf-8", buffering=1)
            sys.stdout = sys.stderr = log
            print(f"\n[sherpa] запуск {time.strftime('%Y-%m-%d %H:%M:%S')}")
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
