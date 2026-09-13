import type { PlayerPos } from './pywebview'

/**
 * Сквад: позиции друзей через лаунчер-хост (`/api/squad/<room>`).
 * Хост — чей-то лаунчер (LAN-адрес или cloudflared-туннель). Комната — общий код.
 */

export interface SquadMember { pos: PlayerPos | null; map: string; ts: number; online: boolean }
export interface SquadSnapshot { room: string; members: Record<string, SquadMember> }

export const ROOM_RE = /^[A-Za-z0-9_-]{3,40}$/

export function makeRoomCode(): string {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]
  return s
}

export function squadBase(url: string): string {
  const u = url.trim().replace(/\/+$/, '')
  return u ? (u.startsWith('http') ? u : `https://${u}`) : ''
}

export async function publishSquad(url: string, room: string, name: string, pos: PlayerPos | null, map: string, online = true): Promise<boolean> {
  try {
    const r = await fetch(`${squadBase(url)}/api/squad/${room}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pos, map, online }),
      keepalive: !online,
    })
    return r.ok
  } catch { return false }
}

/** Подписка на комнату с переподключением; возвращает stop(). */
export function subscribeSquad(url: string, room: string, onSnap: (s: SquadSnapshot) => void, onState: (ok: boolean) => void): () => void {
  let es: EventSource | null = null
  let stopped = false
  let delay = 2000
  const open = () => {
    if (stopped) return
    es = new EventSource(`${squadBase(url)}/api/squad/${room}/stream`)
    es.onopen = () => { delay = 2000; onState(true) }
    es.onmessage = (e) => { try { onSnap(JSON.parse(e.data)) } catch { /* ignore */ } }
    es.onerror = () => {
      onState(false)
      es?.close()
      es = null
      if (!stopped) setTimeout(open, delay)
      delay = Math.min(delay * 2, 30_000)
    }
  }
  open()
  return () => { stopped = true; es?.close() }
}
