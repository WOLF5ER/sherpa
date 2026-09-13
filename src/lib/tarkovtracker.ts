import type { GameData } from '@/data/types'
import type { Faction } from '@/store/profile'

/**
 * Импорт прогресса из TarkovTracker (tarkovtracker.org).
 * Запрос идёт через локальный прокси (/api/tt → api.tarkovtracker.org): их API не отдаёт CORS
 * для сторонних сайтов и требует User-Agent, который браузер подменить не может.
 */

export interface TTProgress {
  tasksProgress: { id: string; complete: boolean; failed?: boolean; invalid?: boolean }[]
  taskObjectivesProgress?: { id: string; complete: boolean; count?: number; invalid?: boolean }[]
  hideoutModulesProgress: { id: string; complete: boolean }[]
  playerLevel: number
  pmcFaction: string
  displayName?: string
}

export interface TTResult {
  level: number
  faction: Faction
  completed: Record<string, true>
  objectivesDone: Record<string, true>
  stations: Record<string, number>
  gameMode: string
  displayName: string
  unknownTasks: number
}

export function tokenMode(token: string): 'pvp' | 'pve' | 'seasonal' | null {
  const t = token.trim().toUpperCase()
  if (t.startsWith('PVP_')) return 'pvp'
  if (t.startsWith('PVE_')) return 'pve'
  if (t.startsWith('SZN_')) return 'seasonal'
  return null
}

export async function fetchTarkovTracker(token: string): Promise<{ data: TTProgress; gameMode: string }> {
  const res = await fetch('/api/tt/progress', {
    headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' },
  })
  let body: { success?: boolean; error?: string; data?: TTProgress; meta?: { gameMode?: string } } | null = null
  try { body = await res.json() } catch { /* не JSON */ }
  if (res.status === 401) throw new Error('Токен не принят — проверь, что скопирован целиком и не отозван')
  if (res.status === 429) throw new Error('Лимит запросов TarkovTracker исчерпан, попробуй позже')
  if (!res.ok || !body?.success || !body.data) {
    throw new Error(body?.error ?? `TarkovTracker ответил ${res.status}${res.status === 404 ? ' — запусти Sherpa через start.bat или npm run dev' : ''}`)
  }
  return { data: body.data, gameMode: body.meta?.gameMode ?? tokenMode(token) ?? 'pvp' }
}

/** Переводит ответ TarkovTracker в поля профиля Sherpa. */
export function mapProgress(data: GameData, p: TTProgress, gameMode: string): TTResult {
  const completed: Record<string, true> = {}
  let unknownTasks = 0
  for (const t of p.tasksProgress ?? []) {
    if (!t.complete || t.failed || t.invalid) continue
    if (data.tasks[t.id]) completed[t.id] = true
    else unknownTasks++
  }
  const objectivesDone: Record<string, true> = {}
  for (const o of p.taskObjectivesProgress ?? []) if (o.complete && !o.invalid) objectivesDone[o.id] = true
  // id уровня станции у tarkov.dev — «<station>-<level>»; берём максимальный завершённый
  const stations: Record<string, number> = {}
  const levelById = new Map<string, { station: string; level: number }>()
  for (const st of Object.values(data.stations)) for (const l of st.levels) levelById.set(l.id, { station: st.id, level: l.level })
  for (const m of p.hideoutModulesProgress ?? []) {
    if (!m.complete) continue
    const hit = levelById.get(m.id)
    if (!hit) continue
    stations[hit.station] = Math.max(stations[hit.station] ?? 0, hit.level)
  }
  const faction: Faction = String(p.pmcFaction).toUpperCase() === 'BEAR' ? 'BEAR' : 'USEC'
  return {
    level: Math.max(1, Math.min(79, Number(p.playerLevel) || 1)),
    faction,
    completed,
    objectivesDone,
    stations,
    gameMode,
    displayName: p.displayName ?? '',
    unknownTasks,
  }
}
