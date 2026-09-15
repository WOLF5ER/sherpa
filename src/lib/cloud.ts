import { create } from 'zustand'
import type { AccountInfo, LauncherApi, StateBackup } from './pywebview'
import { meaningful } from './backup'

/**
 * Облачная синхронизация: снимок прогресса (тот же, что в state.json) лежит в облаке под Discord-аккаунтом.
 * Offline-first: приложение живёт на localStorage, облако — зеркало. Новее облако — подтягиваем и перезагружаем,
 * новее локальное — отправляем. Кто последний записал, тот и прав.
 */
export interface CloudState {
  /** лаунчер умеет аккаунт */
  available: boolean
  info: AccountInfo | null
  /** идёт обмен с облаком */
  busy: boolean
  /** последняя успешная синхронизация (ms) */
  syncedAt: number
  /** сообщение для профиля (ошибка или подсказка) */
  note: string
  refresh: () => Promise<AccountInfo | null>
  login: () => Promise<void>
  logout: () => Promise<void>
  sync: () => Promise<void>
}

const AT_KEY = 'sherpa:backupAt'
let api: LauncherApi | null = null
let snapshotFn: (() => StateBackup) | null = null
let applyFn: ((b: StateBackup) => boolean) | null = null
/** снимок, который пришёл во время синхронизации — отправим, как только она закончится */
let pendingPush: StateBackup | null = null

function localAt(): number {
  try { return Number(localStorage.getItem(AT_KEY)) || 0 } catch { return 0 }
}

export const useCloud = create<CloudState>()((set, get) => ({
  available: false, info: null, busy: false, syncedAt: 0, note: '',
  refresh: async () => {
    if (!api?.account_info) return null
    try {
      const info = await api.account_info()
      set({ info })
      return info
    } catch { return null }
  },
  login: async () => {
    if (!api?.account_login) return
    set({ note: 'Открыл браузер — подтверди вход в Discord…' })
    const info = await api.account_login().catch(() => null)
    if (info) set({ info })
    // ждём, пока браузер вернёт токен в лаунчер (до 3 минут)
    const started = Date.now()
    const tick = async () => {
      const i = await get().refresh()
      if (i?.user) { set({ note: '' }); await get().sync(); return }
      if (i?.stage === 'error') { set({ note: i.error }); return }
      if (Date.now() - started > 180_000) { set({ note: 'Вход не подтверждён — попробуй ещё раз' }); return }
      setTimeout(tick, 2000)
    }
    setTimeout(tick, 2000)
  },
  logout: async () => {
    if (!api?.account_logout) return
    const info = await api.account_logout().catch(() => null)
    set({ info, note: '', syncedAt: 0 })
  },
  sync: async () => {
    if (!api?.cloud_get || !api.cloud_put || !snapshotFn || !applyFn || get().busy) return
    const info = get().info ?? (await get().refresh())
    if (!info?.user) return
    set({ busy: true })
    try {
      const remote = await api.cloud_get()
      if (remote && 'error' in remote) { set({ note: remote.error }); await get().refresh(); return }
      const mine = localAt()
      if (remote && remote.keys && typeof remote.savedAt === 'number' && remote.savedAt > mine + 1000) {
        // в облаке новее — применяем и перезагружаем страницу
        if (applyFn(remote)) {
          console.info('[sherpa] прогресс подтянут из облака', new Date(remote.savedAt).toLocaleString('ru-RU'))
          location.reload()
          return
        }
      }
      if (!remote || remote.savedAt < mine) {
        const snap = snapshotFn()
        if (meaningful(snap)) {
          snap.savedAt = mine || snap.savedAt
          const r = await api.cloud_put(JSON.stringify(snap))
          if (!r.ok && r.error) { set({ note: r.error }); await get().refresh(); return }
        }
      }
      set({ note: '', syncedAt: Date.now() })
      await get().refresh()
    } catch (e) {
      set({ note: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ busy: false })
      if (pendingPush) { const p = pendingPush; pendingPush = null; void cloudPush(p) }
    }
  },
}))

/** Отправить снимок в облако после локального сохранения (вызывает backup.ts). Ошибки не мешают работе. */
export async function cloudPush(snap: StateBackup) {
  if (!api?.cloud_put) return
  const s = useCloud.getState()
  if (!s.info?.user || !meaningful(snap)) return
  if (s.busy) { pendingPush = snap; return }
  try {
    const r = await api.cloud_put(JSON.stringify(snap))
    if (r.ok) useCloud.setState({ syncedAt: Date.now(), note: '' })
    else if (r.stale) void s.sync() // в облаке новее — подтянем
    else if (r.error) useCloud.setState({ note: r.error })
  } catch { /* облако недоступно — локально всё сохранено */ }
}

/** Подключить облако к лаунчеру; snapshot/apply — из backup.ts. */
export async function installCloud(a: LauncherApi, snapshot: () => StateBackup, apply: (b: StateBackup) => boolean) {
  api = a
  snapshotFn = snapshot
  applyFn = apply
  if (!a.account_info) return
  useCloud.setState({ available: true })
  const info = await useCloud.getState().refresh()
  if (info?.user) await useCloud.getState().sync()
}
