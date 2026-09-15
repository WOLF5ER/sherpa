import type { LauncherApi, StateBackup } from './pywebview'
import { useProfile } from '@/store/profile'
import { useUI } from '@/store/ui'
import { useBuilds } from '@/store/builds'
import { useWatch } from '@/store/watch'

/**
 * Прогресс живёт в localStorage WebView2, а он привязан к origin (порту) и профилю браузера: занялся порт 4879,
 * переехал профиль — и всё «обнулилось». Поэтому в лаунчере все ключи sherpa:* зеркалятся в файл AppData/Sherpa/state.json,
 * а при старте, если файл новее локального снимка (или локального нет), восстанавливаются из него.
 */
const AT_KEY = 'sherpa:backupAt'
const PREFIX = 'sherpa:'

function snapshot(): StateBackup {
  const keys: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX) && k !== AT_KEY) keys[k] = localStorage.getItem(k) ?? ''
  }
  return { savedAt: Date.now(), keys }
}

/** Есть ли в снимке что-то, ради чего стоит восстанавливаться (не пустой профиль). */
function meaningful(b: StateBackup | null): b is StateBackup {
  if (!b?.keys) return false
  const p = b.keys['sherpa:profile']
  return typeof p === 'string' && p.length > 0
}

export function installBackup() {
  // только главное окно лаунчера: мини-карта, окно карты и телефон свои копии не пишут
  const hash = location.hash
  if (hash.startsWith('#/mini') || hash.startsWith('#/mapwin') || hash.startsWith('#/live')) return
  const start = (api: LauncherApi) => {
    if (!api.state_get || !api.state_put) return
    let timer: number | null = null
    const save = () => {
      timer = null
      try {
        const snap = snapshot()
        localStorage.setItem(AT_KEY, String(snap.savedAt))
        void api.state_put!(JSON.stringify(snap)).catch(() => {})
      } catch { /* localStorage недоступен — нечего копировать */ }
    }
    const schedule = () => { if (timer == null) timer = window.setTimeout(save, 1500) }
    api.state_get().then((file) => {
      let localAt = 0
      try { localAt = Number(localStorage.getItem(AT_KEY)) || 0 } catch { /* ignore */ }
      if (meaningful(file) && file.savedAt > localAt + 1000) {
        // файл свежее — значит, локальный снимок старый или пустой (новый origin): восстанавливаем и перезагружаем
        try {
          for (const [k, v] of Object.entries(file.keys)) localStorage.setItem(k, v)
          localStorage.setItem(AT_KEY, String(file.savedAt))
        } catch { return }
        console.info('[sherpa] прогресс восстановлен из резервной копии', new Date(file.savedAt).toLocaleString('ru-RU'))
        location.reload()
        return
      }
      // локальный снимок актуален — зеркалим изменения в файл
      useProfile.subscribe(schedule)
      useUI.subscribe(schedule)
      useBuilds.subscribe(schedule)
      useWatch.subscribe(schedule)
      window.addEventListener('pagehide', () => { if (timer != null) { clearTimeout(timer); save() } })
      save()
    }).catch(() => {})
  }
  const api = window.pywebview?.api
  if (api) start(api)
  else window.addEventListener('pywebviewready', () => { const a = window.pywebview?.api; if (a) start(a) }, { once: true })
}
