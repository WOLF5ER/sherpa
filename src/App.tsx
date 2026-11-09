import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useData } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useUI } from '@/store/ui'
import { useRaids } from '@/store/raids'
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
import { MapWindowPage } from '@/pages/MapWindow'
import { LivePage } from '@/pages/Live'
import { SquadPage } from '@/pages/Squad'
import { RaidsPage } from '@/pages/Raids'
import { KeysPage } from '@/pages/Keys'
import { SkillsPage } from '@/pages/Skills'
import type { PlayerPos, UpdateInfo, GameInfo, GameRaidLog } from '@/lib/pywebview'
import { locationToMapName } from '@/lib/pywebview'
import { gameInRaid } from '@/lib/machines'
import { fetchTarkovTracker, mapProgress } from '@/lib/tarkovtracker'
import { canPickFolder, folderPermission, savedFolder, watchFolder } from '@/lib/screenshots'
import { publishSquad, subscribeSquad, ROOM_RE } from '@/lib/squad'
import { eventProgressMigration } from '@/data/eventTasks'

export function App() {
  const status = useData((s) => s.status)
  const data = useData((s) => s.data)
  const load = useData((s) => s.load)
  const mode = useProfile((s) => s.gameMode)

  useEffect(() => { void load(mode) }, [load, mode])

  // когда tarkov.dev начнёт отдавать ивентовые квесты, наши hw-* исчезнут — переносим на них отметки
  useEffect(() => {
    if (!data) return
    const p = useProfile.getState()
    const pairs = eventProgressMigration(data, p.completed)
    if (!pairs.length) return
    p.uncompleteMany(pairs.map((x) => x.from))
    p.completeMany(pairs.map((x) => x.to))
  }, [data])

  const launcher = useLauncher()
  // мини-карта и окно карты живут в отдельных окнах: синхронизации, сквад, запись рейдов и слежение за папкой — только в главном
  const isMini = location.hash.startsWith('#/mini') || location.hash.startsWith('#/mapwin') || location.hash.startsWith('#/live')

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
    // карта/стадия из логов игры — лаунчер шлёт во все окна; переключение карты ниже, только в главном
    const onGame = (e: Event) => useUI.getState().setGameInfo((e as CustomEvent<GameInfo>).detail)
    // мини-карта и окно карты — отдельные окна со своим store: их отметки «пункт выполнен» приходят через localStorage,
    // а выбранная там карта нужна главному окну (история рейдов, сквад)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'sherpa:profile') void useProfile.persist.rehydrate()
      // выбор карты в окне карты/мини-карте — отдельный ключ (не sherpa:ui: тот пишут все окна, выходила петля)
      if (e.key === 'sherpa:currentMap' && !isMini) {
        const id = e.newValue
        if (id && id !== useUI.getState().currentMapId) useUI.getState().setCurrentMapId(id)
      }
    }
    window.addEventListener('sherpa:pos', on)
    window.addEventListener('sherpa:game', onGame)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('sherpa:pos', on); window.removeEventListener('sherpa:game', onGame); window.removeEventListener('storage', onStorage) }
  }, [isMini])

  // логи игры: рейд начался (loading/raid) — открываем его карту; в меню ничего не трогаем
  const gameInfo = useUI((s) => s.gameInfo)
  const autoMapSwitch = useUI((s) => s.autoMapSwitch)
  useEffect(() => {
    if (isMini || !autoMapSwitch || !data || !gameInfo || !gameInRaid(gameInfo)) return
    const norm = locationToMapName(gameInfo.location)
    if (!norm) return
    const target = Object.values(data.maps).find((m) => m.normalizedName === norm)
    if (target && useUI.getState().currentMapId !== target.id) useUI.getState().setCurrentMapId(target.id)
  }, [gameInfo, autoMapSwitch, data, isMini])

  // рейды из логов игры: начался — текущим (и сразу карта известна), закрылся — исход (умер/выжил) сам
  useEffect(() => {
    if (isMini || !data) return
    const mapIdOf = (loc?: string) => {
      const norm = locationToMapName(loc)
      return norm ? Object.values(data.maps).find((m) => m.normalizedName === norm)?.id : undefined
    }
    const onRaid = (e: Event) => {
      const d = (e as CustomEvent<{ stage: string; raid: GameRaidLog }>).detail
      if (!d?.raid) return
      const r = d.raid
      if (d.stage === 'end') useRaids.getState().endLogRaid({ sid: r.sid, mapId: mapIdOf(r.location), start: r.start, end: r.end, outcome: r.outcome })
      else useRaids.getState().beginLogRaid({ sid: r.sid, mapId: mapIdOf(r.location), start: r.start })
    }
    window.addEventListener('sherpa:raid', onRaid)
    // история рейдов сессии, накопившаяся до загрузки страницы
    launcher?.get_game_raids?.().then((list) => {
      for (const r of list ?? []) useRaids.getState().endLogRaid({ sid: r.sid, mapId: mapIdOf(r.location), start: r.start, end: r.end, outcome: r.outcome })
    }).catch(() => {})
    return () => window.removeEventListener('sherpa:raid', onRaid)
  }, [isMini, data, launcher])

  // «карта на телефоне»: лаунчер отдаёт телефону текущую карту главного окна
  const liveMapId = useUI((s) => s.currentMapId)
  const liveMapName = liveMapId && data ? data.maps[liveMapId]?.normalizedName ?? '' : ''
  useEffect(() => { if (launcher?.set_live_map && !isMini) launcher.set_live_map(liveMapName).catch(() => {}) }, [launcher, isMini, liveMapName])

  // обновления: лаунчер проверяет релизы на GitHub и шлёт событие; в браузере обновлять нечего
  useEffect(() => {
    if (!launcher?.update_info || isMini) return
    launcher.update_info().then((u) => useUI.getState().setUpdateInfo(u)).catch(() => {})
    const on = (e: Event) => useUI.getState().setUpdateInfo((e as CustomEvent<UpdateInfo>).detail)
    window.addEventListener('sherpa:update', on)
    return () => window.removeEventListener('sherpa:update', on)
  }, [launcher, isMini])

  // история рейдов: каждая точка «ты здесь» пишется в текущий рейд (только главное окно — у мини-карты свой store)
  useEffect(() => {
    if (isMini) return
    void useRaids.getState().init()
    return useUI.subscribe((s, prev) => {
      if (s.playerPos && s.playerPos !== prev.playerPos) useRaids.getState().record(s.playerPos, s.currentMapId)
    })
  }, [isMini])

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
    if (!squadActive) { useUI.getState().setSquadMembers({}); useUI.getState().setSquadPhase('off'); useUI.getState().setSquadMarks({}); useUI.getState().setSquadMap(''); return }
    const stop = subscribeSquad(squad.url, squad.room, (snap) => {
      const ui = useUI.getState()
      ui.setSquadMembers(snap.members)
      ui.setSquadMarks(snap.marks ?? {})
      ui.setSquadMap(snap.map ?? '')
    }, (phase) => useUI.getState().setSquadPhase(phase))
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
      es.onmessage = (e) => { try {
        const d = JSON.parse(e.data) as PlayerPos & { type?: string; stage?: string }
        if (d.type === 'game') useUI.getState().setGameInfo(d as unknown as GameInfo)
        else if (d.type === 'raid') { /* телефон историю рейдов не показывает — только не считаем это позицией */ }
        else useUI.getState().setPlayerPos(d)
      } catch { /* ignore */ } }
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
      <Route path="/mapwin" element={<MapWindowPage />} />
      <Route path="/live" element={<LivePage />} />
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
        <Route path="/raids" element={<RaidsPage />} />
        <Route path="/keys" element={<KeysPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Route>
    </Routes>
  )
}
