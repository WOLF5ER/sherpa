import { create } from 'zustand'
import { fetchAll, readCache, PRICE_TTL_MS, type GameMode } from '@/data/loader'
import type { GameData } from '@/data/types'

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface DataState {
  status: Status
  data: GameData | null
  mode: GameMode | null
  progress: string
  error: string | null
  refreshing: boolean
  load: (mode: GameMode) => Promise<void>
  refresh: () => Promise<void>
}

let inflight: AbortController | null = null

export const useData = create<DataState>()((set, get) => ({
  status: 'idle',
  data: null,
  mode: null,
  progress: '',
  error: null,
  refreshing: false,

  load: async (mode) => {
    inflight?.abort()
    const ctrl = new AbortController()
    inflight = ctrl
    set({ status: 'loading', progress: 'Проверяю кэш…', error: null, mode })
    const cached = await readCache(mode)
    if (ctrl.signal.aborted) return
    if (cached) {
      set({ status: 'ready', data: cached })
      if (Date.now() - cached.fetchedAt > PRICE_TTL_MS) void get().refresh()
      return
    }
    try {
      const data = await fetchAll(mode, (progress) => set({ progress }), ctrl.signal)
      if (ctrl.signal.aborted) return
      set({ status: 'ready', data })
    } catch (e) {
      if (ctrl.signal.aborted) return
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },

  refresh: async () => {
    const { mode, refreshing } = get()
    if (!mode || refreshing) return
    set({ refreshing: true })
    try {
      const data = await fetchAll(mode)
      if (get().mode === mode) set({ data, status: 'ready', error: null })
    } catch (e) {
      // цены остаются старыми — не роняем приложение
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ refreshing: false })
    }
  },
}))

/** Данные гарантированно загружены (использовать только внутри страниц под гейтом). */
export function useGame(): GameData {
  const data = useData((s) => s.data)
  if (!data) throw new Error('Данные ещё не загружены')
  return data
}
