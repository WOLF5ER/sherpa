import { useEffect, useState } from 'react'

export interface LauncherState {
  /** версия сборки лаунчера (dist/version.json) */
  version?: string
  on_top: boolean
  visible: boolean
  screenshots: boolean
  screenshots_path: string
  screenshots_path_exists?: boolean
  lan_url: string | null
  tunnel_url?: string | null
  tunnel_state?: string
  /** прозрачность окон мини-карты и карты (0.2–1) */
  minimap_opacity?: number
  map_opacity?: number
  mapwin_open?: boolean
}

export interface LauncherApi {
  set_on_top: (v: boolean) => Promise<boolean>
  set_screenshot_watch: (v: boolean) => Promise<LauncherState>
  set_screenshots_path?: (path: string) => Promise<LauncherState>
  enable_lan?: (on: boolean) => Promise<LauncherState>
  enable_tunnel?: (on: boolean) => Promise<LauncherState>
  open_minimap?: () => Promise<void>
  close_minimap?: () => Promise<void>
  toggle_minimap?: () => Promise<boolean>
  /** отдельное окно карты поверх игры (F7) */
  open_mapwin?: () => Promise<boolean>
  close_mapwin?: () => Promise<boolean>
  toggle_mapwin?: () => Promise<boolean>
  set_minimap_opacity?: (v: number) => Promise<number>
  /** карта, открытая в главном окне — телефон (/live) едет за ней */
  set_live_map?: (name: string) => Promise<string>
  set_map_opacity?: (v: number) => Promise<number>
  /** диалог «Сохранить как» + запись файла; null — отмена */
  save_file?: (name: string, text: string) => Promise<string | null>
  get_state: () => Promise<LauncherState>
  /** резервная копия прогресса (localStorage sherpa:*) в AppData — переживает смену порта и обновления */
  state_get?: () => Promise<StateBackup | null>
  state_put?: (text: string) => Promise<boolean>
  /** аккаунт (Discord) и облачная синхронизация снимка прогресса — запросы к облаку делает лаунчер */
  account_info?: () => Promise<AccountInfo>
  account_login?: () => Promise<AccountInfo>
  account_logout?: () => Promise<AccountInfo>
  cloud_get?: () => Promise<StateBackup | { error: string } | null>
  cloud_put?: (text: string) => Promise<{ ok: boolean; stale?: boolean; error?: string }>
  /** произвольный запрос к облаку (история рейдов); токен подставляет лаунчер */
  cloud_req?: (method: string, path: string, body: string | null) => Promise<{ status: number; body: string }>
  /** обновления: последний релиз на GitHub */
  update_info?: () => Promise<UpdateInfo>
  check_update?: () => Promise<UpdateInfo>
  install_update?: () => Promise<{ ok: boolean; error?: string }>
  /** открыть ссылку в системном браузере */
  open_url?: (url: string) => Promise<boolean>
}

export interface UpdateInfo {
  version: string
  update: { version: string; notes: string; url: string; size: number; page: string; published?: string | null } | null
  state: { stage: 'idle' | 'checking' | 'downloading' | 'extracting' | 'restarting' | 'error'; done?: number; total?: number; error?: string; page?: string }
  checked_at: number
  can_install: boolean
  page: string
}

export interface AccountUser { id: string; name: string; avatar: string | null }
export interface AccountInfo {
  user: AccountUser | null
  stage: 'idle' | 'pending' | 'ok' | 'error'
  error: string
  synced_at: number
  cloud_url: string
}

export interface StateBackup { savedAt: number; keys: Record<string, string> }

export interface PlayerPos { x: number; y: number; z: number; rotation: number; file: string; ts: number }

declare global {
  interface Window { pywebview?: { api?: LauncherApi } }
}

/** API лаунчера (pywebview), если приложение открыто через него; иначе null. */
export function useLauncher(): LauncherApi | null {
  const [api, setApi] = useState<LauncherApi | null>(() => window.pywebview?.api ?? null)
  useEffect(() => {
    if (api) return
    const on = () => setApi(window.pywebview?.api ?? null)
    window.addEventListener('pywebviewready', on)
    return () => window.removeEventListener('pywebviewready', on)
  }, [api])
  return api
}

export function useOnTop(api: LauncherApi | null): [boolean, (v: boolean) => void] {
  const [onTop, setOnTop] = useState(true)
  useEffect(() => {
    if (!api) return
    api.get_state().then((s) => setOnTop(s.on_top)).catch(() => {})
    const on = (e: Event) => setOnTop(!!(e as CustomEvent<boolean>).detail)
    window.addEventListener('sherpa:ontop', on)
    return () => window.removeEventListener('sherpa:ontop', on)
  }, [api])
  return [onTop, (v) => { setOnTop(v); api?.set_on_top(v).catch(() => {}) }]
}
