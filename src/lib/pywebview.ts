import { useEffect, useState } from 'react'

export interface LauncherState {
  on_top: boolean
  visible: boolean
  screenshots: boolean
  screenshots_path: string
  lan_url: string | null
  tunnel_url?: string | null
  tunnel_state?: string
}

export interface LauncherApi {
  set_opacity: (v: number) => Promise<void>
  set_on_top: (v: boolean) => Promise<boolean>
  set_screenshot_watch: (v: boolean) => Promise<LauncherState>
  get_state: () => Promise<LauncherState>
}

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
