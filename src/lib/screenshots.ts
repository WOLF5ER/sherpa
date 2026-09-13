import { get, set, del } from 'idb-keyval'
import type { PlayerPos } from './pywebview'

/**
 * «Ты здесь» без лаунчера: браузер сам следит за папкой скриншотов через File System Access API
 * (Chrome/Edge/WebView2). Читаются только имена файлов — Тарков пишет в них позицию и поворот.
 */

const SHOT_RE = /\d{4}-\d{2}-\d{2}\[\d{2}-\d{2}\]_?(?<pos>.+) \(\d+\)\.png$/
const POS_RE = /(?<x>-?\d+\.\d+), (?<y>-?\d+\.\d+), (?<z>-?\d+\.\d+)_?(?<rx>-?\d\.\d+), (?<ry>-?\d\.\d+), (?<rz>-?\d\.\d+), (?<rw>-?\d\.\d+)/

export function parseScreenshotName(name: string, ts = Date.now()): PlayerPos | null {
  const m = SHOT_RE.exec(name)
  if (!m?.groups) return null
  const p = POS_RE.exec(m.groups.pos)
  if (!p?.groups) return null
  const g = p.groups
  const x = +g.x, y = +g.y, z = +g.z
  const rx = +g.rx, ry = +g.ry, rz = +g.rz, rw = +g.rw
  // формула TarkovMonitor: оси y/z кватерниона поменяны местами
  const qx = rx, qz = ry, qy = rz, qw = rw
  const yaw = Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz)) * 180 / Math.PI
  return { x, y, z, rotation: yaw, file: name, ts }
}

type DirHandle = FileSystemDirectoryHandle & { queryPermission?: (o: { mode: 'read' }) => Promise<PermissionState>; requestPermission?: (o: { mode: 'read' }) => Promise<PermissionState> }
declare global {
  interface Window { showDirectoryPicker?: (opts?: { id?: string; mode?: 'read'; startIn?: string }) => Promise<FileSystemDirectoryHandle> }
}

const HANDLE_KEY = 'sherpa:shotsDir'

export const canPickFolder = () => typeof window !== 'undefined' && !!window.showDirectoryPicker

export async function pickScreenshotsFolder(): Promise<DirHandle | null> {
  if (!window.showDirectoryPicker) return null
  const h = await window.showDirectoryPicker({ id: 'tarkov-screenshots', mode: 'read' })
  await set(HANDLE_KEY, h).catch(() => {})
  return h as DirHandle
}

export async function savedFolder(): Promise<DirHandle | null> {
  return (await get<DirHandle>(HANDLE_KEY).catch(() => undefined)) ?? null
}

export async function forgetFolder() { await del(HANDLE_KEY).catch(() => {}) }

/** 'granted' | 'prompt' | 'denied' — если prompt, нужен клик пользователя для requestPermission. */
export async function folderPermission(h: DirHandle, request = false): Promise<PermissionState> {
  try {
    const q = await h.queryPermission?.({ mode: 'read' })
    if (q === 'granted' || !request) return q ?? 'denied'
    return (await h.requestPermission?.({ mode: 'read' })) ?? 'denied'
  } catch { return 'denied' }
}

/** Опрашивает папку раз в секунду; отдаёт новые скриншоты. Возвращает stop(). */
export function watchFolder(h: DirHandle, onPos: (p: PlayerPos) => void, intervalMs = 1000): () => void {
  // имена уже виденных файлов — getFile() зовём только для новых (в папке могут быть тысячи скриншотов)
  const known = new Set<string>()
  let primed = false
  let stopped = false
  let busy = false
  const tick = async () => {
    if (stopped || busy) return
    busy = true
    try {
      let newest: { t: number; name: string } | null = null
      for await (const [name, entry] of (h as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
        if (entry.kind !== 'file' || !name.toLowerCase().endsWith('.png') || known.has(name)) continue
        known.add(name)
        if (!primed) continue // первый проход — просто запоминаем то, что уже лежит
        if (!SHOT_RE.test(name)) continue
        const f = await (entry as FileSystemFileHandle).getFile()
        if (!newest || f.lastModified > newest.t) newest = { t: f.lastModified, name }
      }
      primed = true
      if (newest) {
        const p = parseScreenshotName(newest.name, newest.t)
        if (p) onPos(p)
      }
    } catch { /* папка недоступна — попробуем позже */ } finally { busy = false }
  }
  void tick()
  const id = setInterval(tick, intervalMs)
  return () => { stopped = true; clearInterval(id) }
}
