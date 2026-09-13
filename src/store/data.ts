import { create } from 'zustand'
import { fetchAll, readCache, PRICE_TTL_MS, type GameMode } from '@/data/loader'
import type { GameData } from '@/data/types'
import type { WorkerRequest, WorkerResponse } from '@/data/loader.worker'

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

/* ── загрузка в воркере, с откатом на основной поток, если воркер недоступен ── */
let worker: Worker | null = null
let reqId = 0
const pending = new Map<number, { resolve: (d: GameData) => void; reject: (e: Error) => void; onProgress?: (m: string) => void }>()

function getWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('../data/loader.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      const p = pending.get(msg.id)
      if (!p) return
      if (msg.type === 'progress') p.onProgress?.(msg.message)
      else if (msg.type === 'done') { pending.delete(msg.id); p.resolve(msg.data as GameData) }
      else { pending.delete(msg.id); p.reject(new Error(msg.error)) }
    }
    worker.onerror = () => {
      // воркер сломался — отвечаем всем ожидающим ошибкой и дальше грузим в основном потоке
      for (const [id, p] of pending) { pending.delete(id); p.reject(new Error('worker failed')) }
      worker?.terminate()
      worker = null
    }
    return worker
  } catch {
    return null
  }
}

async function fetchAllAsync(mode: GameMode, onProgress?: (m: string) => void, signal?: AbortSignal): Promise<GameData> {
  const w = getWorker()
  if (!w) return fetchAll(mode, onProgress, signal)
  const id = ++reqId
  try {
    return await new Promise<GameData>((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress })
      w.postMessage({ id, mode } satisfies WorkerRequest)
      signal?.addEventListener('abort', () => { pending.delete(id); reject(new DOMException('aborted', 'AbortError')) }, { once: true })
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    // на всякий случай — основной поток
    return fetchAll(mode, onProgress, signal)
  }
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
    const hadData = !!get().data
    // при смене режима с готовыми данными не мигаем экраном загрузки — сначала пробуем кэш
    if (!hadData) set({ status: 'loading', progress: 'Проверяю кэш…', error: null, mode })
    else set({ mode, error: null })
    const cached = await readCache(mode)
    if (ctrl.signal.aborted) return
    if (cached) {
      set({ status: 'ready', data: cached })
      if (Date.now() - cached.fetchedAt > PRICE_TTL_MS) void get().refresh()
      return
    }
    set({ status: 'loading', progress: 'Загружаю справочник…' })
    try {
      const data = await fetchAllAsync(mode, (progress) => { if (!ctrl.signal.aborted) set({ progress }) }, ctrl.signal)
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
      const data = await fetchAllAsync(mode)
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
