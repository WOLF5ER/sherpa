import { get, set, del } from 'idb-keyval'
import { mergeSeasonTasks } from './seasonTasks'
import { normalize, type RawBundle } from './normalize'
import type { GameData } from './types'

export type GameMode = 'regular' | 'pve' | 'pvp-season'

export const MODE_LABEL: Record<GameMode, string> = { regular: 'PvP', pve: 'PvE', 'pvp-season': 'Сезон' }

const BASE = 'https://json.tarkov.dev'
export const PRICE_TTL_MS = 15 * 60 * 1000

const cacheKey = (mode: GameMode) => `sherpa:data:${mode}:v10`

async function getJson<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { signal })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export async function fetchAll(mode: GameMode, onProgress?: (msg: string) => void, signal?: AbortSignal): Promise<GameData> {
  const m = mode
  onProgress?.('Загружаю предметы и цены…')
  // Переводы не зависят от режима — всегда из regular
  const [
    items, itemsRu, itemsEn,
    tasks, tasksRu, tasksEn,
    maps, mapsRu, mapsEn,
    traders, tradersRu, tradersEn,
    hideout, hideoutRu, hideoutEn,
    crafts, barters,
  ] = await Promise.all([
    getJson(`${m}/items`, signal), getJson(`regular/items_ru`, signal), getJson(`regular/items_en`, signal),
    getJson(`${m}/tasks`, signal), getJson(`regular/tasks_ru`, signal), getJson(`regular/tasks_en`, signal),
    getJson(`${m}/maps`, signal), getJson(`regular/maps_ru`, signal), getJson(`regular/maps_en`, signal),
    getJson(`${m}/traders`, signal), getJson(`regular/traders_ru`, signal), getJson(`regular/traders_en`, signal),
    getJson(`${m}/hideout`, signal), getJson(`regular/hideout_ru`, signal), getJson(`regular/hideout_en`, signal),
    getJson(`${m}/crafts`, signal), getJson(`${m}/barters`, signal),
  ])
  onProgress?.('Собираю справочник…')
  const pick = (x: unknown) => ((x as { data?: Record<string, string> })?.data ?? {}) as Record<string, string>
  const raw: RawBundle = {
    items, itemsRu: pick(itemsRu), itemsEn: pick(itemsEn),
    tasks, tasksRu: pick(tasksRu), tasksEn: pick(tasksEn),
    maps, mapsRu: pick(mapsRu), mapsEn: pick(mapsEn),
    traders, tradersRu: pick(tradersRu), tradersEn: pick(tradersEn),
    hideout, hideoutRu: pick(hideoutRu), hideoutEn: pick(hideoutEn),
    crafts, barters,
  }
  const data = mode === 'pvp-season' ? mergeSeasonTasks(normalize(raw)) : normalize(raw)
  onProgress?.('Сохраняю кэш…')
  try { await set(cacheKey(mode), data) } catch { /* кэш не критичен */ }
  return data
}

export async function readCache(mode: GameMode): Promise<GameData | undefined> {
  try {
    const d = await get<GameData>(cacheKey(mode))
    if (d && d.items && d.tasks && d.maps) return d
  } catch { /* ignore */ }
  return undefined
}

export async function clearCache(mode: GameMode) {
  try { await del(cacheKey(mode)) } catch { /* ignore */ }
}
