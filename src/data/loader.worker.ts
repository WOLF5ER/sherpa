/// <reference lib="webworker" />
import { fetchAll, type GameMode } from './loader'

/**
 * Загрузка и нормализация справочника в отдельном потоке: парсинг ~25 МБ JSON и сборка структур
 * не блокируют интерфейс (особенно при фоновом обновлении цен каждые 15 минут).
 */
export interface WorkerRequest { id: number; mode: GameMode }
export type WorkerResponse =
  | { id: number; type: 'progress'; message: string }
  | { id: number; type: 'done'; data: unknown }
  | { id: number; type: 'error'; error: string }

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, mode } = e.data
  try {
    const data = await fetchAll(mode, (message) => self.postMessage({ id, type: 'progress', message } satisfies WorkerResponse))
    self.postMessage({ id, type: 'done', data } satisfies WorkerResponse)
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse)
  }
}
