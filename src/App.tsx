import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useData } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useUI } from '@/store/ui'
import { useLauncher } from '@/lib/pywebview'
import { Shell } from '@/components/Shell'
import { Boot } from '@/components/Boot'
import { TasksPage } from '@/pages/Tasks'
import { NeedsPage } from '@/pages/Needs'
import { MarketPage } from '@/pages/Market'
import { CraftsPage } from '@/pages/Crafts'
import { MapsPage } from '@/pages/Maps'
import { ProfilePage } from '@/pages/Profile'
import { SeasonPage } from '@/pages/Season'
import { RaidPage } from '@/pages/Raid'
import { HideoutPage } from '@/pages/Hideout'
import { AmmoPage } from '@/pages/Ammo'
import { BuilderPage } from '@/pages/Builder'
import { MiniPage } from '@/pages/Mini'
import { SquadPage } from '@/pages/Squad'
import type { PlayerPos } from '@/lib/pywebview'
import { fetchTarkovTracker, mapProgress } from '@/lib/tarkovtracker'
import { canPickFolder, folderPermission, savedFolder, watchFolder } from '@/lib/screenshots'
import { publishSquad, subscribeSquad, ROOM_RE } from '@/lib/squad'

export function App() {
  const status = useData((s) => s.status)
  const data = useData((s) => s.data)
  const load = useData((s) => s.load)
  const mode = useProfile((s) => s.gameMode)

  useEffect(() => { void load(mode) }, [load, mode])

  const launcher = useLauncher()
  // мини-карта живёт в отдельном окне: синхронизации, сквад и слежение за папкой — только в главном
  const isMini = location.hash.startsWith('#/mini')

  // тема: атрибут на <html>, чтобы CSS-переменные переключались целиком
  const theme = useUI((s) => s.theme)
  useEffect(() => {
    // ?theme=light|dark в адресе — принудительно (для ссылок и скриншотов)
    const forced = new URLSearchParams(location.search).get('theme')
    if (forced === 'light' || forced === 'dark') useUI.getState().setTheme(forced)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme)
  }, [theme])

  // «ты здесь»: лаунчер шлёт координаты из имени скриншота
  const screenshotsWatch = useUI((s) => s.screenshotsWatch)
  useEffect(() => { launcher?.set_screenshot_watch(screenshotsWatch).catch(() => {}) }, [launcher, screenshotsWatch])
  useEffect(() => {
    const on = (e: Event) => useUI.getState().setPlayerPos((e as CustomEvent<PlayerPos>).detail)
    window.addEventListener('sherpa:pos', on)
    return () => window.removeEventListener('sherpa:pos', on)
  }, [])

  // без лаунчера: папка скриншотов через File System Access API
  const folderStatus = useUI((s) => s.folderStatus)
  useEffect(() => {
    if (launcher || isMini) return
    if (!canPickFolder()) { useUI.getState().setFolderStatus('unsupported'); return }
    let stop: (() => void) | null = null
    let cancelled = false
    ;(async () => {
      const h = await savedFolder()
      if (cancelled) return
      if (!h) { useUI.getState().setFolderStatus('none'); return }
      const perm = await folderPermission(h)
      if (cancelled) return
      useUI.getState().setFolderStatus(perm === 'granted' ? 'granted' : 'prompt')
      if (perm === 'granted' && screenshotsWatch) stop = watchFolder(h, (p) => useUI.getState().setPlayerPos(p))
    })()
    return () => { cancelled = true; stop?.() }
  }, [launcher, screenshotsWatch, folderStatus === 'granted'])

  // сквад: подписка на комнату и публикация своей позиции
  const squad = useUI((s) => s.squad)
  const playerPos = useUI((s) => s.playerPos)
  const currentMapId = useUI((s) => s.currentMapId)
  const squadActive = !!squad.room && ROOM_RE.test(squad.room) && (!!squad.url || !!launcher)
  // общая карта сквада: если включено «следовать», переключаем свою карту
  const squadMap = useUI((s) => s.squadMap)
  useEffect(() => {
    if (!squadActive || !squad.followMap || !squadMap || !data) return
    const target = Object.values(data.maps).find((m) => m.normalizedName === squadMap)
    if (target && useUI.getState().currentMapId !== target.id) useUI.getState().setCurrentMapId(target.id)
  }, [squadActive, squad.followMap, squadMap, data])

  useEffect(() => {
    if (!squadActive) { useUI.getState().setSquadMembers({}); useUI.getState().setSquadConnected(false); useUI.getState().setSquadMarks({}); useUI.getState().setSquadMap(''); return }
    const stop = subscribeSquad(squad.url, squad.room, (snap) => {
      const ui = useUI.getState()
      ui.setSquadMembers(snap.members)
      ui.setSquadMarks(snap.marks ?? {})
      ui.setSquadMap(snap.map ?? '')
    }, (ok) => useUI.getState().setSquadConnected(ok))
    return stop
  }, [squadActive, squad.url, squad.room])
  useEffect(() => {
    if (!squadActive || !squad.share || !squad.name || isMini) return // мини-карта только слушает
    const mapName = currentMapId && data ? data.maps[currentMapId]?.normalizedName ?? '' : ''
    void publishSquad(squad.url, squad.room, squad.name, playerPos, mapName)
    const t = setInterval(() => void publishSquad(squad.url, squad.room, squad.name, useUI.getState().playerPos, mapName), 60_000)
    const bye = () => { void publishSquad(squad.url, squad.room, squad.name, null, mapName, false) }
    window.addEventListener('beforeunload', bye)
    return () => { clearInterval(t); window.removeEventListener('beforeunload', bye) }
  }, [squadActive, squad.share, squad.name, squad.url, squad.room, playerPos, currentMapId, data])

  // телефон / второй ПК: позиция приходит от лаунчера по сети (SSE)
  useEffect(() => {
    if (launcher || location.protocol === 'https:') return // https = открыли чужой хост через туннель, его позиция — не наша
    let es: EventSource | null = null
    let cancelled = false
    // pywebview объявляет window.pywebview чуть позже первого рендера — даём ему секунду, чтобы не открывать поток к самому себе
    const timer = setTimeout(() => { if (cancelled || window.pywebview) return; fetch('/api/pos/last').then((r) => {
      // dev-сервер отдаёт index.html на любой путь — подписываемся только на настоящий ответ лаунчера
      if (cancelled || !(r.status === 200 || r.status === 204) || !(r.headers.get('content-type') ?? '').includes('json')) return
      es = new EventSource('/api/pos/stream')
      es.onmessage = (e) => { try { useUI.getState().setPlayerPos(JSON.parse(e.data)) } catch { /* ignore */ } }
    }).catch(() => {}) }, 1500)
    return () => { cancelled = true; clearTimeout(timer); es?.close() }
  }, [launcher])

  // автосинхронизация с TarkovTracker раз в 10 минут, если задан токен
  const ttToken = useProfile((s) => s.ttToken)
  useEffect(() => {
    if (!ttToken || !data || isMini) return
    let stop = false
    const sync = async () => {
      try {
        const { data: prog, gameMode } = await fetchTarkovTracker(ttToken)
        if (stop) return
        const r = mapProgress(data, prog, gameMode)
        // пустой ответ (новый аккаунт, не тот токен) не должен стереть локальный прогресс
        if (!Object.keys(r.completed).length && Object.keys(useProfile.getState().completed).length) return
        useProfile.getState().applyImport({ level: r.level, faction: r.faction, completed: r.completed, objectivesDone: r.objectivesDone, stations: r.stations, ttSyncedAt: Date.now() })
      } catch { /* тихо: ручной импорт покажет ошибку */ }
    }
    const t = setInterval(sync, 10 * 60 * 1000)
    return () => { stop = true; clearInterval(t) }
  }, [ttToken, data])

  if (status !== 'ready') return <Boot />

  return (
    <Routes>
      <Route path="/mini" element={<MiniPage />} />
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/tasks" replace />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/raid" element={<RaidPage />} />
        <Route path="/hideout" element={<HideoutPage />} />
        <Route path="/ammo" element={<AmmoPage />} />
        <Route path="/builder" element={<BuilderPage />} />
        <Route path="/needs" element={<NeedsPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/crafts" element={<CraftsPage />} />
        <Route path="/maps" element={<MapsPage />} />
        <Route path="/season" element={<SeasonPage />} />
        <Route path="/squad" element={<SquadPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Route>
    </Routes>
  )
}
