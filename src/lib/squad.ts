import type { PlayerPos } from './pywebview'

/**
 * Сквад: позиции друзей через лаунчер-хост (`/api/squad/<room>`).
 * Хост — чей-то лаунчер (LAN-адрес или cloudflared-туннель). Комната — общий код.
 */

export interface SquadMember { pos: PlayerPos | null; map: string; ts: number; online: boolean }
export interface SquadMark { id: string; by: string; label: string; x: number; z: number; y: number; map: string; ts: number }
export interface SquadSnapshot { room: string; members: Record<string, SquadMember>; map?: string; marks?: Record<string, SquadMark> }

export const ROOM_RE = /^[A-Za-z0-9_-]{3,40}$/

export function makeRoomCode(): string {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]
  return s
}

/** Приглашение — одна ссылка: адрес хоста + код. Её можно и вставить в «Войти», и просто открыть в браузере. */
export function makeInvite(hostUrl: string, room: string): string {
  return `${squadBase(hostUrl)}/#/squad?join=${room}`
}

/** Разбираем всё, что вставил друг: ссылку-приглашение, «код + адрес» текстом или голый код. */
export function parseInvite(text: string): { room: string; url: string } {
  const t = text.trim()
  const urlM = t.match(/https?:\/\/[^\s#"'<>]+/i) ?? t.match(/\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/)
  const raw = urlM?.[0].replace(/\/+$/, '') ?? ''
  const url = raw ? squadBase(/^https?:/i.test(raw) ? raw : `http://${raw}`) : '' // голый ip:port — это LAN, без https
  const joinM = t.match(/[?&]join=([A-Za-z0-9_-]{3,40})/)
  let room = joinM?.[1] ?? ''
  if (!room) {
    // голый код или «комната abc123»: первое слово-код, не похожее на адрес
    const rest = t.replace(/https?:\/\/[^\s]+/gi, ' ')
    const m = rest.match(/(?:комната|room|код|code)\s*[:：]?\s*([A-Za-z0-9_-]{3,40})/i) ?? rest.match(/(?:^|\s)([a-z0-9_-]{3,40})(?:\s|$)/)
    room = m?.[1] ?? ''
  }
  return { room: ROOM_RE.test(room) ? room : '', url }
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

/** Общая карта сквада: один выбрал — у всех переключилось. */
export async function publishSquadMap(url: string, room: string, name: string, map: string): Promise<boolean> {
  try {
    const r = await fetch(`${squadBase(url)}/api/squad/${room}/map`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, map }) })
    return r.ok
  } catch { return false }
}

/** Общая метка (пинг) — или её удаление. */
export async function publishSquadMark(url: string, room: string, name: string, mark: Omit<SquadMark, 'by' | 'ts'>, remove = false): Promise<boolean> {
  try {
    const r = await fetch(`${squadBase(url)}/api/squad/${room}/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, ...mark, remove }) })
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
