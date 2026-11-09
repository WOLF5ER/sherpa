import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import { ChevronLeft, ChevronRight, ChevronDown, X, Play, Pause, SkipBack, Crosshair, Check } from 'lucide-react'
import { useGame } from '@/store/data'
import { useUI } from '@/store/ui'
import { useProfile } from '@/store/profile'
import { useRaids, type Raid } from '@/store/raids'
import { useTaskViews } from '@/lib/useCtx'
import { findMeta } from '@/data/mapMeta'
import { fetchKordDocs, type KordDocSpot, type KordDocs } from '@/data/kordDocs'
import { BP_DOC_IDS, BP_DOC_SET } from '@/data/battlePassDocs'
import { makeCRS, pos, boundsOf, scaledBounds, icon, dot, COLORS, svgBaseFor, applySvgFloor, containerIcon, MARKER_SVG, type IconKind } from '@/lib/leaflet'
import { fleaPrice } from '@/lib/flea'
import { computeNeeds, CURRENCY } from '@/lib/needs'
import { extractsOf, FACTION_RU } from '@/lib/extracts'
import { TRANSIT_NOTE } from '@/data/extractRules'
import { rubShort } from '@/lib/format'
import type { GameMap, Objective, XYZ, Zone } from '@/data/types'
import type { TaskView } from '@/lib/tasks'
import { Chip, Eyebrow, Segmented } from '@/components/ui'
import { PositionPanel } from '@/components/PositionPanel'
import { useLauncher } from '@/lib/pywebview'
import { publishSquadMap, publishSquadMark, ROOM_RE } from '@/lib/squad'
import { floorForPosition, visibleOnFloor } from '@/lib/floors'
import { ItemCell } from '@/components/ItemCell'
import { renderWikiPics } from '@/components/WikiPics'
import { reportError } from '@/lib/crashlog'

const MAP_ORDER = ['customs', 'factory', 'woods', 'shoreline', 'interchange', 'reserve', 'lighthouse', 'streets-of-tarkov', 'ground-zero', 'the-lab', 'the-labyrinth', 'terminal', 'icebreaker', 'night-factory', 'ground-zero-21', 'the-lab-dark']

import { DEFAULT_TOGGLES, type ToggleKey, type Toggles, LOOSE_CATEGORIES, KEY_CATEGORY, KEYCARDS, KEYCARD_COLORS, isKeycard, LEDX } from '@/lib/mapLayers'

const allToggles = (v: boolean): Toggles =>
  Object.fromEntries(Object.keys(DEFAULT_TOGGLES).map((k) => [k, v])) as Toggles

/** меню слоёв: секции как у tarkov-navigator, у каждой строки — иконка маркера и счётчик по карте */
const LAYER_SECTIONS: { title: string; rows: { key: ToggleKey; label: string; color: string; icon: IconKind | 'dot' }[] }[] = [
  { title: 'Выходы', rows: [
    { key: 'exitsPmc', label: 'Выходы ЧВК', color: COLORS.pmc, icon: 'exit' },
    { key: 'exitsScav', label: 'Выходы диких', color: COLORS.scav, icon: 'exit' },
    { key: 'exitsShared', label: 'Общие выходы', color: COLORS.shared, icon: 'exit' },
    { key: 'transits', label: 'Переходы', color: COLORS.transit, icon: 'transit' },
  ] },
  { title: 'Квесты', rows: [
    { key: 'quests', label: 'Мои квесты', color: COLORS.quest, icon: 'flag' },
  ] },
  { title: 'Спавны и боссы', rows: [
    { key: 'spawnsPmc', label: 'Спавн ЧВК', color: COLORS.pmc, icon: 'dot' },
    { key: 'spawnsScav', label: 'Спавн диких', color: COLORS.scav, icon: 'dot' },
    { key: 'snipers', label: 'Снайперы', color: COLORS.scav, icon: 'cross' },
    { key: 'spawnsSeason', label: 'Сезонные спавны', color: COLORS.season, icon: 'dot' },
    { key: 'bosses', label: 'Боссы', color: COLORS.boss, icon: 'skull' },
  ] },
  { title: 'Ключи', rows: [
    { key: 'locks', label: 'Двери и замки', color: COLORS.key, icon: 'key' },
    { key: 'keySpawns', label: 'Спавн ключей', color: COLORS.key, icon: 'dot' },
    { key: 'keycards', label: 'Ключ-карты', color: '#e04b4b', icon: 'card' },
    { key: 'ledx', label: 'LEDX', color: '#5fd0d0', icon: 'ledx' },
  ] },
  { title: 'Лут', rows: [
    { key: 'bpDocs', label: 'Документы пропуска', color: COLORS.season, icon: 'doc' },
    { key: 'containers', label: 'Контейнеры', color: COLORS.loot, icon: 'box' },
    { key: 'loose', label: 'Рассыпной лут', color: COLORS.item, icon: 'dot' },
  ] },
  { title: 'Разное', rows: [
    { key: 'hazards', label: 'Опасности', color: COLORS.hazard, icon: 'warn' },
    { key: 'switches', label: 'Рубильники', color: COLORS.switch, icon: 'bolt' },
    { key: 'weapons', label: 'Стационарные пулемёты', color: COLORS.weapon, icon: 'cross' },
    { key: 'btr', label: 'БТР', color: COLORS.btr, icon: 'bus' },
  ] },
]

/** выбор карты: кнопка с текущей картой, по клику — выпадающий список (а не все чипы разом) */
function MapPicker({ maps, value, onPick }: { maps: { id: string; name: string }[]; value: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const current = maps.find((m) => m.id === value)
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={`input ${open ? 'input-focus' : ''} w-full h-8 flex items-center gap-2 text-[13px] hover:border-ink-4`}>
        <span className="flex-1 text-left truncate uppercase tracking-[.06em]">{current?.name ?? 'Выбрать карту'}</span>
        <ChevronDown size={13} className={`text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[600] panel shadow-lg p-1 max-h-[60vh] overflow-y-auto flex flex-col gap-px">
          {maps.map((m) => (
            <button key={m.id} type="button" onClick={() => { onPick(m.id); setOpen(false) }}
              className={`layer-row h-7 ${m.id === value ? 'layer-on' : ''}`} style={m.id === value ? { borderColor: 'var(--color-brass)' } : undefined}>
              <span className="truncate flex-1 text-left">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const LEGEND: { label: string; color: string }[] = [
  { label: 'ЧВК', color: COLORS.pmc }, { label: 'Дикие', color: COLORS.scav }, { label: 'Общий', color: COLORS.shared },
  { label: 'Переход', color: COLORS.transit }, { label: 'Квест', color: COLORS.quest }, { label: 'Сезон', color: COLORS.season },
]
/** цвет трека повтора рейда */
const REPLAY_COLOR = '#b58cff'
const REPLAY_SPEEDS = [10, 30, 100]
const fmtClock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
/** типы пунктов, у которых есть «место» на карте */
const PLACE_OBJECTIVES = new Set<Objective['type']>(['visit', 'findQuestItem', 'plantItem', 'plantQuestItem', 'mark', 'useItem'])

export function MapsPage({ standalone = false, live }: { standalone?: boolean; live?: { hostMap: string | null } } = {}) {
  const data = useGame()
  const views = useTaskViews()
  const overlay = useUI((s) => s.overlay)
  const openItem = useUI((s) => s.openItem)
  const gameMode = useProfile((s) => s.gameMode)
  const objectivesDone = useProfile((s) => s.objectivesDone)
  const toggleObjective = useProfile((s) => s.toggleObjective)
  const toggleTask = useProfile((s) => s.toggleTask)
  const playerPos = useUI((s) => s.playerPos)
  const trail = useUI((s) => s.trail)
  const follow = useUI((s) => s.followPlayer)
  const autoFloor = useUI((s) => s.autoFloor)
  const mapStyle = useUI((s) => s.mapStyle)
  const setMapStyle = useUI((s) => s.setMapStyle)
  const marks = useUI((s) => s.marks)
  const addMark = useUI((s) => s.addMark)
  const removeMark = useUI((s) => s.removeMark)
  const squadMembers = useUI((s) => s.squadMembers)
  const squadMarks = useUI((s) => s.squadMarks)
  const squad = useUI((s) => s.squad)
  const squadName = squad.name
  const squadActive = !!squad.room && ROOM_RE.test(squad.room) && (!!squad.url || !!window.pywebview)
  const currentMapId = useUI((s) => s.currentMapId)
  const trackedTasks = useUI((s) => s.trackedTasks)
  const toggleTracked = useUI((s) => s.toggleTracked)
  const clearTracked = useUI((s) => s.clearTracked)
  const tracked = useMemo(() => new Set(trackedTasks), [trackedTasks])
  const setCurrentMapId = useUI((s) => s.setCurrentMapId)
  const squadRef = useRef<L.LayerGroup | null>(null)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const mapsWithMeta = useMemo(() => {
    const list = Object.values(data.maps).filter((m) => findMeta(m.normalizedName))
    return list.sort((a, b) => MAP_ORDER.indexOf(a.normalizedName) - MAP_ORDER.indexOf(b.normalizedName))
  }, [data])

  const paramMap = params.get('map')
  const taskParam = params.get('task')
  const keyParam = params.get('key')
  const itemParam = params.get('item')
  const raidParam = params.get('raid')

  // ── повтор рейда из истории: трек целиком + бегунок по времени ──
  const [replay, setReplay] = useState<Raid | null>(null)
  const [replayT, setReplayT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(30)
  const replayRef = useRef<L.LayerGroup | null>(null)
  const replayFitted = useRef<string | null>(null) // id рейда, под который карта уже вписана
  useEffect(() => {
    if (!raidParam) { setReplay(null); setPlaying(false); return }
    let on = true
    void useRaids.getState().load(raidParam).then((r) => { if (!on) return; setReplay(r); setReplayT(0); setPlaying(false) })
    return () => { on = false }
  }, [raidParam])
  const replayDur = replay ? replay.end - replay.start : 0
  useEffect(() => {
    if (!playing || !replay) return
    const t = setInterval(() => setReplayT((v) => {
      const next = v + 100 * speed
      if (next >= replayDur) { setPlaying(false); return replayDur }
      return next
    }), 100)
    return () => clearInterval(t)
  }, [playing, replay, speed, replayDur])
  // точка трека на текущем времени повтора
  const replayPoint = useMemo(() => {
    if (!replay?.points.length) return null
    const at = replay.start + replayT
    let p = replay.points[0]
    for (const q of replay.points) { if (q.t <= at) p = q; else break }
    return p
  }, [replay, replayT])

  // ── где лежит предмет: считаем по всем картам ──
  const itemSpots = useMemo(() => {
    if (!itemParam) return null
    const out: { map: GameMap; points: XYZ[] }[] = []
    for (const m of mapsWithMeta) {
      const points = m.lootLoose.filter((l) => l.items.includes(itemParam)).map((l) => l.position)
      if (points.length) out.push({ map: m, points })
    }
    return out.sort((a, b) => b.points.length - a.points.length)
  }, [itemParam, mapsWithMeta])

  const [mapId, setMapId] = useState<string>(() => {
    const byParam = paramMap && mapsWithMeta.find((m) => m.normalizedName === paramMap)
    if (byParam) return byParam.id
    if (taskParam) {
      const t = data.tasks[taskParam]
      const z = t?.objectives.flatMap((o) => o.zones ?? []).find((zz) => data.maps[zz.map] && findMeta(data.maps[zz.map].normalizedName))
      if (z) return z.map
      if (t?.map && findMeta(data.maps[t.map]?.normalizedName ?? '')) return t.map
    }
    // карта из store: лаунчер уже определил карту рейда из логов (App.tsx кладёт её в currentMapId),
    // и открытая позже вкладка карт должна показать её, а не первую в списке
    const fromStore = useUI.getState().currentMapId
    if (fromStore && data.maps[fromStore] && findMeta(data.maps[fromStore].normalizedName)) return fromStore
    return mapsWithMeta[0]?.id
  })
  // диагностика петли карт: каждое место смены mapId помечено, при >8 сменах/сек в лог уходит виновник
  const mapIdLog = useRef<number[]>([])
  const setMapIdWhy = (id: string, why: string) => {
    const now = Date.now()
    mapIdLog.current = mapIdLog.current.filter((t) => now - t < 1000)
    mapIdLog.current.push(now)
    if (mapIdLog.current.length >= 8) reportError('mapid', `setMapId x${mapIdLog.current.length}/сек ${why} → ${id}`, new Error().stack)
    setMapId(id)
  }
  useEffect(() => {
    if (itemSpots?.length && !paramMap) setMapIdWhy(itemSpots[0].map.id, 'itemSpots')
  }, [itemSpots, paramMap])
  useEffect(() => {
    if (replay?.mapId && data.maps[replay.mapId] && findMeta(data.maps[replay.mapId].normalizedName)) setMapIdWhy(replay.mapId, 'replay')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay])
  // телефон: едем за картой хоста
  useEffect(() => {
    if (!live?.hostMap) return
    const m = mapsWithMeta.find((x) => x.normalizedName === live.hostMap)
    if (m && m.id !== mapId) setMapIdWhy(m.id, 'live-hostMap')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.hostMap])
  useEffect(() => {
    const byParam = paramMap && mapsWithMeta.find((m) => m.normalizedName === paramMap)
    if (byParam && byParam.id !== mapId) setMapIdWhy(byParam.id, 'paramMap')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramMap])

  const gmap = data.maps[mapId]
  const meta = gmap ? findMeta(gmap.normalizedName) : undefined
  // своя карта — в отдельный ключ sherpa:currentMap: через persist (sherpa:ui) окна перезаписывали
  // значение друг друга в петле storage-событий; здесь пишем только при реальной смене
  useEffect(() => {
    setCurrentMapId(mapId ?? null)
    try { if (localStorage.getItem('sherpa:currentMap') !== (mapId ?? '')) localStorage.setItem('sherpa:currentMap', mapId ?? '') } catch { /* ignore */ }
  }, [mapId, setCurrentMapId])
  // сквад переключил общую карту — идём за ним.
  // fresh из getState(), а не w из рендера: наш же эффект выше только что записал mapId в store,
  // и сравнение со «старым» w устраивало вечное эхо mapId↔store — React падал с #185
  useEffect(() => {
    if (!squadActive || !squad.followMap) return
    const fresh = useUI.getState().currentMapId
    if (fresh && fresh !== mapId && data.maps[fresh]) { setMapIdWhy(fresh, 'squad-follow'); if (paramMap) clearParams() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMapId])
  // карта сменилась вне этой вкладки (логи игры: загрузка в рейд, окно карты, мини-карта) — идём за store.
  // fresh из getState() — тот же приём, что у сквад-следования: наш эффект выше только что записал
  // mapId в store, и сравнение с «старым» w устраивало вечное эхо mapId↔store (#185)
  // первый запуск пропускаем: на монтировании мы сами только что записали mapId в store,
  // и следование за ним перебило бы карту из URL-параметров
  const storeFollowFirst = useRef(true)
  useEffect(() => {
    if (storeFollowFirst.current) { storeFollowFirst.current = false; return }
    const fresh = useUI.getState().currentMapId
    if (fresh && fresh !== mapId && data.maps[fresh] && findMeta(data.maps[fresh].normalizedName)) {
      setMapIdWhy(fresh, 'store-follow')
      if (paramMap) clearParams()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMapId])
  const pickMap = (id: string) => {
    setMapIdWhy(id, 'pickMap')
    if (paramMap) clearParams()
    if (squadActive && squad.followMap && data.maps[id]) void publishSquadMap(squad.url, squad.room, squad.name, data.maps[id].normalizedName)
  }

  // v2: слои разбиты по фракциям/категориям — старый ключ не читаем
  const [toggles, setToggles] = useState<Toggles>(() => {
    try { return { ...DEFAULT_TOGGLES, ...JSON.parse(localStorage.getItem('sherpa:mapToggles2') ?? '{}') } } catch { return DEFAULT_TOGGLES }
  })
  useEffect(() => { try { localStorage.setItem('sherpa:mapToggles2', JSON.stringify(toggles)) } catch { /* ignore */ } }, [toggles])
  /** свёрнутые секции меню слоёв — по названию секции */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('sherpa:mapSections') ?? '{}') } catch { return {} }
  })
  useEffect(() => { try { localStorage.setItem('sherpa:mapSections', JSON.stringify(collapsed)) } catch { /* ignore */ } }, [collapsed])
  // этаж хранится вместе с id карты: при смене карты эффекты этого же коммита уже видят -1, а не индекс с прошлой карты
  const [floorState, setFloorState] = useState<{ mapId: string; floor: number }>({ mapId: '', floor: -1 })
  const floor = floorState.mapId === mapId ? floorState.floor : -1
  const setFloor = (f: number) => setFloorState({ mapId, floor: f })
  const [questScope, setQuestScope] = useState<'available' | 'all'>('available')
  const [lootType, setLootType] = useState<string>('')
  const [looseCat, setLooseCat] = useState<string>('all')
  const [keycardSel, setKeycardSel] = useState<string>('')
  const [bpDocSel, setBpDocSel] = useState<string>('')
  const stations = useProfile((s) => s.stations)
  const have = useProfile((s) => s.have)
  const kappaOnly = useProfile((s) => s.kappaOnly)
  // «нужное мне»: предметы из списка «что нести» (доступные квесты + следующий уровень схрона), которых ещё не хватает
  const neededIds = useMemo(() => {
    const needs = computeNeeds(data, views, stations, have, { includeLocked: false, allHideoutLevels: false, kappaOnly })
    return new Set(needs.filter((n) => !CURRENCY.has(n.item.id) && n.have < n.total).map((n) => n.item.id))
  }, [data, views, stations, have, kappaOnly])
  // точки рассыпного лута по категориям: точка попадает, если хотя бы один её предмет в категории
  const loosePoints = useMemo(() => {
    const out: Record<string, GameMap['lootLoose']> = {}
    if (!gmap) return out
    const known = LOOSE_CATEGORIES.flatMap((c) => c.cats ?? [])
    const inCat = (id: string, cats: string[]) => data.items[id]?.categories.some((c) => cats.includes(c))
    for (const c of LOOSE_CATEGORIES) {
      out[c.id] = gmap.lootLoose.filter((l) =>
        c.id === 'all' ? true
          : c.id === 'needed' ? l.items.some((id) => neededIds.has(id))
            : c.id === 'other' ? l.items.some((id) => data.items[id] && !inCat(id, known))
              : l.items.some((id) => inCat(id, c.cats!)))
    }
    return out
  }, [gmap, data, neededIds])
  const cardPoints = useMemo(() => gmap ? gmap.lootLoose.filter((l) => l.items.some((id) => isKeycard(data.items[id]))) : [], [gmap, data])
  // список карт на этой карте: известные — в порядке ценности, остальные ключ-карты из категории — следом
  const cardsHere = useMemo(() => {
    const ids = new Set<string>()
    for (const l of cardPoints) for (const id of l.items) if (isKeycard(data.items[id])) ids.add(id)
    const known = KEYCARDS.filter((k) => ids.has(k.id))
    const other = [...ids].filter((id) => !KEYCARD_COLORS[id]).map((id) => ({ id, label: data.items[id]?.shortName ?? id, color: '#9aa39c' }))
    return [...known, ...other]
  }, [cardPoints, data])
  const cardCounts = useMemo(() => Object.fromEntries(cardsHere.map((k) => [k.id, cardPoints.filter((l) => l.items.includes(k.id)).length])) as Record<string, number>, [cardsHere, cardPoints])
  const ledxPoints = useMemo(() => gmap ? gmap.lootLoose.filter((l) => l.items.includes(LEDX)) : [], [gmap])
  // документы боевого пропуска (сезон): точки спавна из тех же lootLoose
  const bpDocPoints = useMemo(() => gmap ? gmap.lootLoose.filter((l) => l.items.some((id) => BP_DOC_SET.has(id))) : [], [gmap])
  // фото и подписи спавнов из карты сообщества kord-map-mtdv.ru (снимок public/kord-docs.json)
  const [kord, setKord] = useState<KordDocs | null>(null)
  useEffect(() => { void fetchKordDocs().then((d) => { if (d) setKord(d) }) }, [])
  const kordSpots = useMemo(() => (kord && gmap ? kord.spots.filter((s) => s.map === gmap.normalizedName) : []), [gmap, kord])
  /** фото и подпись точки: ближайший спавн kord-map-mtdv того же типа в радиусе 30 м */
  const spotPhotos = useMemo(() => (l: GameMap['lootLoose'][number]): { caption: string; images: string[] } | null => {
    let best: { caption: string; images: string[] } | null = null
    for (const id of l.items) {
      if (!BP_DOC_SET.has(id)) continue
      let near: KordDocSpot | null = null
      let d2min = 900 // 30 м
      for (const s of kordSpots) {
        if (s.doc !== id) continue
        const d2 = (s.position.x - l.position.x) ** 2 + (s.position.z - l.position.z) ** 2
        if (d2 < d2min) { d2min = d2; near = s }
      }
      if (near?.image) {
        best ??= { caption: '', images: [] }
        if (!best.caption) best.caption = near.caption
        if (!best.images.includes(near.image)) best.images.push(near.image)
      }
    }
    return best
  }, [kordSpots])
  // спавны карты сообщества без пары среди lootLoose (у tarkov.dev их нет) — рисуем отдельно
  const kordExtra = useMemo(() => {
    if (!gmap) return [] as KordDocSpot[]
    return kordSpots.filter((s) => !gmap.lootLoose.some((l) =>
      l.items.includes(s.doc) && (s.position.x - l.position.x) ** 2 + (s.position.z - l.position.z) ** 2 < 900))
  }, [gmap, kordSpots])
  // какие типы документов встречаются на этой карте — в порядке BP_DOC_IDS (как в игре)
  const docsHere = useMemo(() => {
    const ids = new Set<string>()
    for (const l of bpDocPoints) for (const id of l.items) if (BP_DOC_SET.has(id)) ids.add(id)
    for (const s of kordExtra) ids.add(s.doc)
    return BP_DOC_IDS.filter((id) => ids.has(id))
  }, [bpDocPoints, kordExtra])
  // счётчики для меню слоёв
  const layerCounts = useMemo((): Record<ToggleKey, number> => {
    const z = Object.fromEntries(Object.keys(DEFAULT_TOGGLES).map((k) => [k, 0])) as Record<ToggleKey, number>
    if (!gmap) return z
    for (const x of extractsOf(data, gmap, gameMode)) {
      if (!x.extract) continue
      if (x.faction === 'pmc') z.exitsPmc++; else if (x.faction === 'scav') z.exitsScav++; else z.exitsShared++
    }
    z.transits = gmap.transits.length
    for (const s of gmap.spawns) {
      if (s.categories.includes('boss')) continue
      if (s.categories.some((c) => /^season/i.test(c))) z.spawnsSeason++
      else if (s.categories.includes('sniper')) z.snipers++
      else if (s.sides.includes('scav') && !s.sides.includes('pmc') && !s.sides.includes('all')) z.spawnsScav++
      else z.spawnsPmc++
    }
    z.bosses = gmap.bosses.reduce((n, b) => n + b.positions.length, 0)
    z.locks = gmap.locks.length
    z.keySpawns = loosePoints.keys?.length ?? 0
    z.keycards = cardPoints.length
    z.ledx = ledxPoints.length
    z.bpDocs = bpDocPoints.length + kordExtra.length
    z.containers = gmap.lootContainers.length
    z.loose = gmap.lootLoose.length
    z.hazards = gmap.hazards.length
    z.switches = gmap.switches.length
    z.weapons = gmap.stationaryWeapons.length
    z.btr = gmap.btrStops.filter((b) => b.position).length
    for (const v of views.values()) {
      if (v.status === 'done' || (questScope === 'available' && v.status !== 'available' && !tracked.has(v.task.id))) continue
      for (const o of v.task.objectives) for (const zz of o.zones ?? []) if (zz.map === gmap.id && !objectivesDone[o.id]) z.quests++
    }
    return z
  }, [gmap, data, gameMode, loosePoints, cardPoints, ledxPoints, bpDocPoints, kordExtra, views, questScope, objectivesDone, tracked])
  const [panelOpen, setPanelOpen] = useState(!overlay && !live)
  const panelPadRef = useRef(0)
  panelPadRef.current = panelOpen ? (overlay ? 220 : 280) : 0

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const baseRef = useRef<{ tile?: L.TileLayer; svg?: L.SVGOverlay; svgEl?: SVGSVGElement; floorTile?: L.TileLayer }>({})
  const markersRef = useRef<L.LayerGroup | null>(null)
  const posRef = useRef<L.LayerGroup | null>(null)
  const marksRef = useRef<L.LayerGroup | null>(null)

  const clearParams = () => setParams({}, { replace: true })

  // ── создание карты ──
  useEffect(() => {
    if (!containerRef.current || !gmap || !meta) return
    const crs = makeCRS(meta)
    const maxZoom = Math.max(7, meta.maxZoom)
    const map = L.map(containerRef.current, {
      crs, minZoom: meta.minZoom - 1, maxZoom, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
      attributionControl: false, zoomControl: false, preferCanvas: true,
      maxBounds: scaledBounds(meta.bounds, 2), maxBoundsViscosity: 0.6,
    })
    L.control.zoom({ position: 'bottomleft' }).addTo(map)
    // SVG-подложка — в свой pane под overlayPane: у svg в overlayPane z-index 200 и он накрывал canvas-точки (спавны, лут)
    map.createPane('base').style.zIndex = '250'
    map.createPane('floor').style.zIndex = '260' // тайлы этажа — над подложкой любого вида
    mapRef.current = map
    const bounds = boundsOf(meta.bounds)
    const base: typeof baseRef.current = {}
    const tileSize = meta.tileSize ?? 256
    const useSvg = svgBaseFor(meta, mapStyle)
    if (meta.tilePath && !useSvg) {
      base.tile = L.tileLayer(meta.tilePath, { tileSize, bounds, minNativeZoom: meta.minZoom, maxNativeZoom: meta.maxZoom, maxZoom, className: 'base-tiles' }).addTo(map)
    }
    if (meta.svgPath && useSvg) {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      base.svgEl = svgEl
      base.svg = L.svgOverlay(svgEl, meta.svgBounds ? boundsOf(meta.svgBounds) : bounds, { className: 'base-svg', pane: 'base' }).addTo(map)
      fetch(meta.svgPath).then((r) => r.text()).then((txt) => {
        svgEl.innerHTML = txt
        const inner = svgEl.children[0] as SVGSVGElement | undefined
        if (inner?.getAttribute('viewBox')) svgEl.setAttribute('viewBox', inner.getAttribute('viewBox')!)
        applySvgFloor(svgEl, meta, -1)
      }).catch(() => { /* карта без подложки — маркеры всё равно видны */ })
    }
    baseRef.current = base
    markersRef.current = L.layerGroup().addTo(map)
    // панель слоёв лежит поверх карты — вписываем карту в свободную часть
    const fit = () => map.fitBounds(bounds, { animate: false, paddingBottomRight: [panelPadRef.current, 0] })
    fit()
    // контейнер мог ещё не получить размер — подгоняем после раскладки
    const raf = requestAnimationFrame(() => { map.invalidateSize(false); fit() })
    const ro = new ResizeObserver(() => map.invalidateSize(false))
    ro.observe(containerRef.current!)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      map.remove()
      mapRef.current = null
      markersRef.current = null
      baseRef.current = {}
    }
  }, [gmap, meta, mapStyle])

  // ── этажи ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !meta) return
    const base = baseRef.current
    base.floorTile?.remove()
    base.floorTile = undefined
    const layer = floor >= 0 ? meta.layers[floor] : undefined
    if (layer?.tilePath && !(base.svgEl && layer.svgLayer)) {
      const maxZoom = Math.max(7, meta.maxZoom)
      base.floorTile = L.tileLayer(layer.tilePath, { pane: 'floor', tileSize: meta.tileSize ?? 256, bounds: boundsOf(meta.bounds), minNativeZoom: meta.minZoom, maxNativeZoom: meta.maxZoom, maxZoom }).addTo(map)
      base.floorTile.bringToFront()
    }
    base.tile?.getContainer()?.classList.toggle('off-level', !!layer && !layer.show)
    if (base.svgEl) applySvgFloor(base.svgEl, meta, floor)
  }, [floor, meta, mapStyle])

  // ── маркеры ──
  useEffect(() => {
    const map = mapRef.current
    const group = markersRef.current
    if (!map || !group || !gmap || !meta) return
    group.clearLayers()

    const onLevel = (p: XYZ) => visibleOnFloor(meta, floor, p)
    const tip = (m: L.Layer, html: string, opts: L.TooltipOptions = {}) => m.bindTooltip(html, { direction: 'top', offset: [0, -12], ...opts })

    if (toggles.exitsPmc || toggles.exitsScav || toggles.exitsShared) {
      for (const x of extractsOf(data, gmap, gameMode)) {
        const e = x.extract
        if (!e) continue
        if (!(x.faction === 'pmc' ? toggles.exitsPmc : x.faction === 'scav' ? toggles.exitsScav : toggles.exitsShared)) continue
        const color = x.faction === 'pmc' ? COLORS.pmc : x.faction === 'scav' ? COLORS.scav : x.faction === 'shared' ? COLORS.shared : COLORS.btr
        const dim = !onLevel(e.position)
        const label = x.tag ? `${x.label} <i class="mk-req">${x.tag}</i>` : x.label
        const m = L.marker(pos(e.position), { icon: icon('exit', color, label, { dim, rawLabel: true }) })
        const lines = [`<b>${x.label}</b>`, `<span style="color:${color}">${FACTION_RU[x.faction]}</span>${x.notAlways ? ' · не всегда открыт' : ''}${x.single ? ' · одноразовый' : ''}`]
        if (x.req) lines.push(`<span style="color:#f0c46a">${x.req}</span>`)
        if (x.note) lines.push(`<span style="opacity:.75">${x.note}</span>`)
        if (e.switches.length) lines.push('нужен рубильник')
        tip(m, lines.join('<br>'), { className: 'tip-wide' })
        if (x.items.length) m.on('click', () => openItem(x.items[0]))
        group.addLayer(m)
        if (e.outline?.length) group.addLayer(L.polygon(e.outline.map(pos), { color, weight: 1, fillOpacity: dim ? 0.05 : 0.15, interactive: false }))
      }
    }
    if (toggles.transits) {
      for (const t of gmap.transits) {
        const m = L.marker(pos(t.position), { icon: icon('transit', COLORS.transit, undefined, { dim: !onLevel(t.position) }) })
        tip(m, `<b>Транзит</b> → ${t.map ? data.maps[t.map]?.name ?? '' : ''}<br>${t.description}<br><span style="opacity:.75">${TRANSIT_NOTE}</span>`)
        group.addLayer(m)
        if (t.outline?.length) group.addLayer(L.polygon(t.outline.map(pos), { color: COLORS.transit, weight: 1, fillOpacity: 0.12, interactive: false }))
      }
    }
    if (toggles.spawnsPmc || toggles.spawnsScav || toggles.snipers || toggles.spawnsSeason) {
      for (const s of gmap.spawns) {
        if (s.categories.includes('boss')) continue
        const season = s.categories.some((c) => /^season/i.test(c))
        const sniper = s.categories.includes('sniper')
        const scav = !sniper && s.sides.includes('scav') && !s.sides.includes('pmc') && !s.sides.includes('all')
        if (season) { if (!toggles.spawnsSeason) continue } else if (sniper) { if (!toggles.snipers) continue } else if (scav) { if (!toggles.spawnsScav) continue } else if (!toggles.spawnsPmc) continue
        const color = season ? COLORS.season : scav || sniper ? COLORS.scav : COLORS.pmc
        const m = L.circleMarker(pos(s.position), dot(color, season ? 7 : sniper ? 6 : 5, { dim: !onLevel(s.position) }))
        tip(m, season ? `<b>Сезонный спавн</b><br>${s.zoneName}` : sniper ? 'Снайпер-дикий' : scav ? 'Спавн диких' : 'Спавн ЧВК')
        group.addLayer(m)
      }
    }
    if (toggles.bosses) {
      for (const b of gmap.bosses) {
        const chance = Math.round(b.spawnChance * 100)
        for (const p of b.positions) {
          const m = L.marker(pos(p), { icon: icon('skull', COLORS.boss, undefined, { size: 20, dim: !onLevel(p) }) })
          tip(m, `<b>${b.name}</b> · ${chance}%${b.escorts.length ? `<br>свита: ${b.escorts.map((e) => e.name).join(', ')}` : ''}`)
          group.addLayer(m)
        }
      }
    }
    if (toggles.locks) {
      for (const l of gmap.locks) {
        const key = l.key ? data.items[l.key] : null
        const highlighted = keyParam ? l.key === keyParam : true
        const dim = !onLevel(l.position) || !highlighted
        const m = L.marker(pos(l.position), { icon: icon('key', COLORS.key, keyParam && highlighted ? key?.shortName : undefined, { square: true, size: 18, dim }) })
        const price = key ? fleaPrice(key) : null
        tip(m, `<b>${key?.name ?? 'Замок'}</b><br>${l.lockType === 'door' ? 'дверь' : l.lockType}${l.needsPower ? ' · нужно питание' : ''}${price ? ` · ${rubShort(price)}` : ''}`)
        if (key) m.on('click', () => openItem(key.id))
        group.addLayer(m)
      }
    }
    if (toggles.hazards) {
      for (const h of gmap.hazards) {
        const m = L.marker(pos(h.position), { icon: icon('warn', COLORS.hazard, undefined, { size: 18, dim: !onLevel(h.position) }) })
        tip(m, `<b>${h.name}</b>`)
        group.addLayer(m)
        if (h.outline?.length) group.addLayer(L.polygon(h.outline.map(pos), { color: COLORS.hazard, weight: 1, dashArray: '4 3', fillOpacity: 0.12, interactive: false }))
      }
    }
    if (toggles.switches) {
      for (const s of gmap.switches) {
        const m = L.marker(pos(s.position), { icon: icon('bolt', COLORS.switch, undefined, { size: 18, dim: !onLevel(s.position) }) })
        tip(m, `<b>Рубильник</b><br>${s.name}`)
        group.addLayer(m)
      }
    }
    if (toggles.btr) {
      for (const b of gmap.btrStops) {
        if (!b.position) continue
        const m = L.marker(pos(b.position), { icon: icon('bus', COLORS.btr, undefined, { size: 20 }) })
        tip(m, `<b>Остановка БТР</b><br>${b.name}`)
        group.addLayer(m)
      }
    }
    if (toggles.weapons) {
      for (const w of gmap.stationaryWeapons) {
        const m = L.marker(pos(w.position), { icon: icon('cross', COLORS.weapon, undefined, { size: 18, dim: !onLevel(w.position) }) })
        tip(m, `<b>${data.items[w.weapon]?.name ?? 'Стационарное оружие'}</b>`)
        group.addLayer(m)
      }
    }
    if (toggles.containers) {
      for (const c of gmap.lootContainers) {
        if (lootType && c.container !== lootType) continue
        const ci = containerIcon(data.lootContainerTypes[c.container] ?? '')
        const m = L.marker(pos(c.position), { icon: icon(ci.kind, ci.color, undefined, { size: 16, square: true, dim: !onLevel(c.position) }) })
        tip(m, data.lootContainerNames[c.container] ?? 'Контейнер')
        group.addLayer(m)
      }
    }
    // рассыпной лут и спавн ключей — точки с перечнем того, что там бывает
    const looseTip = (l: GameMap['lootLoose'][number], only?: (id: string) => boolean) => {
      const names = l.items.filter((id) => data.items[id] && (!only || only(id))).map((id) => neededIds.has(id) ? `<b style="color:${COLORS.quest}">${data.items[id].shortName}</b>` : data.items[id].shortName)
      const shown = names.slice(0, 8)
      return `${shown.join(' · ')}${names.length > shown.length ? ` <span style="opacity:.6">+${names.length - shown.length}</span>` : ''}`
    }
    if (toggles.loose) {
      const cat = LOOSE_CATEGORIES.find((c) => c.id === looseCat)
      const only = cat?.cats ? (id: string) => !!data.items[id]?.categories.some((c) => cat.cats!.includes(c)) : looseCat === 'needed' ? (id: string) => neededIds.has(id) : undefined
      const color = looseCat === 'needed' ? COLORS.quest : COLORS.item
      for (const l of loosePoints[looseCat] ?? []) {
        const m = L.circleMarker(pos(l.position), dot(color, looseCat === 'all' ? 3 : 4, { dim: !onLevel(l.position) }))
        tip(m, looseTip(l, only), { className: 'tip-wide' })
        const first = l.items.find((id) => (!only || only(id)) && data.items[id])
        if (first) m.on('click', () => openItem(first))
        group.addLayer(m)
      }
    }
    if (toggles.keycards) {
      for (const l of cardPoints) {
        const here = cardsHere.filter((k) => l.items.includes(k.id))
        if (keycardSel && !here.some((k) => k.id === keycardSel)) continue
        const main = keycardSel ? here.find((k) => k.id === keycardSel)! : here[0]
        const m = L.marker(pos(l.position), { icon: icon('card', main.color, undefined, { size: 16, square: true, dim: !onLevel(l.position) }) })
        tip(m, `<b>Ключ-карты</b><br>${here.map((k) => `<span style="color:${k.color === '#3a3f47' ? '#c9ced6' : k.color}">■</span> ${data.items[k.id]?.shortName ?? k.label}`).join('<br>')}`, { className: 'tip-wide' })
        m.on('click', () => openItem(main.id))
        group.addLayer(m)
      }
    }
    if (toggles.ledx) {
      for (const l of ledxPoints) {
        const m = L.marker(pos(l.position), { icon: icon('ledx', '#5fd0d0', undefined, { size: 16, square: true, dim: !onLevel(l.position) }) })
        tip(m, `<b>${data.items[LEDX]?.name ?? 'LEDX'}</b><br>может лежать здесь`)
        m.on('click', () => openItem(LEDX))
        group.addLayer(m)
      }
    }
    // документы боевого пропуска (сезон KORD BREACH) — спавны tarkov.dev + фото из карты сообщества
    const docPopup = (mainId: string, name: string, photos: { caption: string; images: string[] }) => {
      const el = document.createElement('div')
      el.className = 'kpop'
      const title = document.createElement('a')
      title.href = '#'
      title.textContent = name
      title.onclick = (e) => { e.preventDefault(); map.closePopup(); openItem(mainId) }
      const head = document.createElement('div')
      head.className = 'kpop-head'
      head.appendChild(title)
      el.appendChild(head)
      if (photos.caption) { const c = document.createElement('div'); c.className = 'kpop-cap'; c.textContent = photos.caption; el.appendChild(c) }
      for (const im of photos.images.slice(0, 4)) {
        const img = document.createElement('img')
        img.src = im
        img.alt = ''
        img.className = 'kpop-img'
        el.appendChild(img)
      }
      const foot = document.createElement('div')
      foot.className = 'kpop-foot'
      foot.textContent = 'Фото: kord-map-mtdv.ru (сообщество)'
      el.appendChild(foot)
      return el
    }
    if (toggles.bpDocs) {
      for (const l of bpDocPoints) {
        const here = docsHere.filter((id) => l.items.includes(id))
        if (bpDocSel && !here.includes(bpDocSel)) continue
        const m = L.marker(pos(l.position), { icon: icon('doc', COLORS.season, undefined, { size: 16, square: true, dim: !onLevel(l.position) }) })
        const photos = spotPhotos(l)
        const mainId = bpDocSel || here[0]
        const mainName = data.items[mainId]?.name ?? 'Документы пропуска'
        tip(m, `<b>Документы пропуска</b><br>${photos?.caption || here.map((id) => data.items[id]?.shortName ?? id).join(' · ')}`, { className: 'tip-wide' })
        if (photos) {
          m.bindPopup(() => docPopup(mainId, mainName, photos), { closeButton: true, offset: [0, -10], className: 'kpop-wrap', maxWidth: 300 })
        } else {
          m.on('click', () => openItem(mainId))
        }
        group.addLayer(m)
      }
      // спавны карты сообщества без пары среди lootLoose — свои маркеры
      for (const s of kordExtra) {
        if (bpDocSel && s.doc !== bpDocSel) continue
        const m = L.marker(pos(s.position), { icon: icon('doc', COLORS.season, undefined, { size: 16, square: true, dim: !onLevel(s.position) }) })
        const mainName = data.items[s.doc]?.name ?? 'Документы пропуска'
        tip(m, `<b>${data.items[s.doc]?.shortName ?? 'Документ'}</b>${s.caption ? `<br>${s.caption}` : ''}`, { className: 'tip-wide' })
        if (s.image) {
          m.bindPopup(() => docPopup(s.doc, mainName, { caption: s.caption, images: [s.image] }), { closeButton: true, offset: [0, -10], className: 'kpop-wrap', maxWidth: 300 })
        } else {
          m.on('click', () => openItem(s.doc))
        }
        group.addLayer(m)
      }
    }
    if (toggles.keySpawns && !(toggles.loose && looseCat === 'keys')) {
      const isKey = (id: string) => !!data.items[id]?.categories.includes(KEY_CATEGORY)
      for (const l of loosePoints.keys ?? []) {
        const m = L.circleMarker(pos(l.position), dot(COLORS.key, 4, { dim: !onLevel(l.position) }))
        tip(m, `<b>Спавн ключей</b><br>${looseTip(l, isKey)}`, { className: 'tip-wide' })
        const first = l.items.find(isKey)
        if (first) m.on('click', () => openItem(first))
        group.addLayer(m)
      }
    }
    // отслеживаемые квесты рисуем даже при выключенном слое «Мои квесты» — так можно погасить всё и оставить только их
    if (toggles.quests || taskParam || tracked.size) {
      const zoneBounds: L.LatLngExpression[] = []
      const questZones: { v: TaskView; o: Objective; z: Zone }[] = []
      for (const v of views.values()) {
        const isTracked = tracked.has(v.task.id)
        if (taskParam ? v.task.id !== taskParam
          : !toggles.quests ? !isTracked
          : (v.status === 'done' || (questScope === 'available' && v.status !== 'available' && !isTracked))) continue
        // выполненные пункты прячем; в режиме «показать задание» оставляем их бледными, чтобы можно было вернуть
        for (const o of v.task.objectives) for (const z of o.zones ?? []) if (z.map === gmap.id && (taskParam || !objectivesDone[o.id])) questZones.push({ v, o, z })
      }
      // отслеживаемые квесты на этой карте: их метки горят, остальные приглушены и без подписей
      const focusMode = !taskParam && questZones.some(({ v }) => tracked.has(v.task.id))
      // при большом числе зон подписи только по наведению — иначе каша
      const withLabels = questZones.length <= 14 || !!taskParam
      // всплывашка-сводка квеста (как у tarkov-navigator): картинка, кто даёт, что требует, все цели с текущей,
      // награды, кнопки. Реальные DOM-узлы — с обработчиками, без innerHTML
      const popupFor = (v: TaskView, o: Objective, isDone: boolean, z: Zone) => {
        const t = v.task
        const el = document.createElement('div')
        el.className = 'qpop'
        const add = (parent: HTMLElement, tag: string, cls: string, text = '') => { const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; parent.appendChild(n); return n }
        if (t.taskImageLink) { const im = document.createElement('img'); im.src = t.taskImageLink; im.alt = ''; im.className = 'qpop-img'; im.loading = 'lazy'; el.appendChild(im) }
        const head = add(el, 'div', 'qpop-head')
        const trader = data.traders[t.trader]
        if (trader?.imageLink) { const im = document.createElement('img'); im.src = trader.imageLink; im.alt = ''; im.title = trader.name; im.className = 'qpop-trader'; head.appendChild(im) }
        const titleWrap = add(head, 'div', 'min-w-0')
        const title = add(titleWrap, 'button', 'qpop-title', t.name)
        ;(title as HTMLButtonElement).type = 'button'
        title.title = 'Открыть в разделе «Задачи»'
        title.onclick = (e) => { e.stopPropagation(); map.closePopup(); navigate(`/tasks?task=${t.id}`) }
        add(titleWrap, 'div', 'qpop-sub', `${trader?.name ?? ''}${t.experience ? ` · опыт ${t.experience.toLocaleString('ru-RU')}` : ''}${t.minPlayerLevel > 0 ? ` · ${t.minPlayerLevel} ур.` : ''}`)
        // требования: предшественники, уровень торговца, пул
        const req: string[] = []
        for (const r of t.taskRequirements) { const p = data.tasks[r.task]; if (p && !r.status.includes('failed')) req.push(p.name) }
        for (const r of t.traderRequirements) if (r.requirementType === 'level' && r.value > 1) req.push(`${data.traders[r.trader]?.name ?? ''} ур. ${r.value}`)
        if (v.storyLocked) req.push(v.storyLocked.have < 0 ? `${data.traders[v.storyLocked.trader]?.name ?? ''} ур. ${v.storyLocked.ll}` : `квесты ${data.traders[v.storyLocked.trader]?.name ?? ''} ур. ${v.storyLocked.ll}: ${v.storyLocked.have} из ${v.storyLocked.need}`)
        if (t.storyGate) req.push(t.storyGate)
        if (req.length) { const r = add(el, 'div', 'qpop-req'); add(r, 'span', 'qpop-k', 'Требует: '); r.appendChild(document.createTextNode(req.join(', '))) }
        add(el, 'div', 'qpop-k mt-2', 'Цели')
        const ul = add(el, 'ul', 'qpop-list')
        for (const ob of t.objectives) {
          const li = add(ul, 'li', `qpop-obj${ob.id === o.id ? ' is-cur' : ''}${objectivesDone[ob.id] ? ' is-done' : ''}${ob.optional ? ' is-opt' : ''}`, ob.description)
          if (ob.optional) add(li, 'span', 'qpop-opt', ' необязательно')
        }
        const zoneObjs = t.objectives.filter((x) => x.zones?.length)
        const doneCount = zoneObjs.filter((x) => objectivesDone[x.id]).length
        const metaLines: string[] = []
        if (z.spots && z.spots > 1) metaLines.push(`здесь ${z.spots} возможных точек спавна предмета`)
        const sameObj = questZones.filter((q) => q.o.id === o.id && q.z.map === gmap.id).length
        if (sameObj > 1) metaLines.push(`предмет может лежать в одном из ${sameObj} мест на карте`)
        if (o.approx) metaLines.push('≈ координаты приближённые — смотри скрины')
        if (zoneObjs.length > 1) metaLines.push(`пунктов на картах: ${doneCount} / ${zoneObjs.length}${isDone ? ' · этот выполнен' : ''}`)
        for (const m of metaLines) add(el, 'div', 'qpop-meta', m)
        if (o.pics?.length) renderWikiPics(el, o.pics)
        // награды
        const rew: string[] = []
        for (const r of t.rewardStanding) rew.push(`${data.traders[r.trader]?.name ?? ''} ${r.standing > 0 ? '+' : ''}${r.standing.toFixed(2)}`)
        const items = t.rewardItems.map((r) => { const it = data.items[r.item]; return it ? `${it.name}${r.count > 1 ? ` ×${r.count.toLocaleString('ru-RU')}` : ''}` : '' }).filter(Boolean)
        if (rew.length || items.length) {
          add(el, 'div', 'qpop-k mt-2', 'Награды')
          if (rew.length) { const r = add(el, 'div', 'qpop-rew'); add(r, 'span', 'qpop-k', 'Репутация: '); r.appendChild(document.createTextNode(rew.join(' · '))) }
          if (items.length) { const r = add(el, 'div', 'qpop-rew'); add(r, 'span', 'qpop-k', 'Предметы: '); r.appendChild(document.createTextNode(items.join(' · '))) }
        }
        const row = add(el, 'div', 'qpop-actions')
        const btn = (text: string, cls: string, fn: () => void) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text
          b.onclick = (e) => { e.stopPropagation(); map.closePopup(); fn() }
          row.appendChild(b)
        }
        if (!isDone) btn('✓ Пункт выполнен', 'chip chip-on', () => toggleObjective(o.id, true))
        else btn('Вернуть пункт', 'chip', () => toggleObjective(o.id, false))
        btn('Задание выполнено', 'chip', () => toggleTask(t.id, true))
        if (t.wikiLink) { const a = document.createElement('a'); a.href = t.wikiLink; a.target = '_blank'; a.rel = 'noreferrer'; a.className = 'chip'; a.textContent = t.seasonal ? 'tarkov.help' : 'Открыть на вики'; row.appendChild(a) }
        return el
      }
      for (const { v, o, z } of questZones) {
        const isDone = !!objectivesDone[o.id]
        const hot = focusMode && tracked.has(v.task.id) && !isDone
        const dim = !onLevel(z.position) || isDone || (focusMode && !hot)
        const qc = v.task.seasonal ? COLORS.season : COLORS.quest
        if (z.outline?.length) group.addLayer(L.polygon(z.outline.map(pos), { color: qc, weight: hot ? 2 : 1, fillOpacity: dim ? 0.04 : hot ? 0.18 : 0.1, interactive: false }))
        const label = hot || (withLabels && !focusMode) ? (o.approx ? `≈ ${v.task.name}` : v.task.name) : undefined
        const m = L.marker(pos(z.position), { icon: icon('flag', qc, label, { size: hot ? 24 : 20, dim, hot }), zIndexOffset: hot ? 1000 : 0 })
        tip(m, `<b>${v.task.name}</b><br>${o.description}<br><span style="opacity:.6">${o.approx ? '≈ точка приближённая · ' : ''}${z.spots && z.spots > 1 ? `${z.spots} точки спавна · ` : ''}${isDone ? 'пункт выполнен · ' : ''}клик — подробности</span>`)
        m.bindPopup(() => popupFor(v, o, isDone, z), { closeButton: true, offset: [0, -10], className: 'qpop-wrap', maxWidth: 340, maxHeight: 400 })
        group.addLayer(m)
        zoneBounds.push(pos(z.position))
      }
      if (taskParam && zoneBounds.length) map.fitBounds(L.latLngBounds(zoneBounds).pad(0.6), { maxZoom: meta.maxZoom - 1 })
    }
    if (itemParam) {
      const spots = itemSpots?.find((s) => s.map.id === gmap.id)
      if (spots) {
        for (const p of spots.points) {
          const m = L.circleMarker(pos(p), dot(COLORS.item, 6, { dim: !onLevel(p) }))
          tip(m, `<b>${data.items[itemParam]?.name ?? ''}</b><br>может лежать здесь`)
          group.addLayer(m)
        }
      }
    }
    if (keyParam) {
      const pts = gmap.locks.filter((l) => l.key === keyParam).map((l) => pos(l.position))
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.8), { maxZoom: meta.maxZoom - 1 })
    }
  }, [gmap, meta, floor, toggles, questScope, lootType, looseCat, loosePoints, cardPoints, cardsHere, keycardSel, ledxPoints, bpDocPoints, kordExtra, spotPhotos, docsHere, bpDocSel, neededIds, views, data, taskParam, keyParam, itemParam, itemSpots, openItem, gameMode, objectivesDone, toggleObjective, toggleTask, tracked, navigate])

  // ── авто-этаж: по высоте последней точки (при повторе рейда — по точке повтора) ──
  useEffect(() => {
    if (!autoFloor || !meta) return
    const p = replay ? replayPoint : playerPos
    if (!p) return
    setFloor(floorForPosition(meta, p))
  }, [playerPos, replayPoint, replay, meta, autoFloor])

  // ── повтор рейда: трек, пройденная часть и стрелка ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !meta) return
    replayRef.current?.remove()
    replayRef.current = null
    if (!replay || replay.mapId !== gmap?.id || !replay.points.length || !replayPoint) return
    const group = L.layerGroup()
    const pts = replay.points
    group.addLayer(L.polyline(pts.map(pos), { color: REPLAY_COLOR, weight: 2, opacity: 0.35, interactive: false }))
    const done = pts.filter((p) => p.t <= replayPoint.t)
    if (done.length > 1) group.addLayer(L.polyline(done.map(pos), { color: REPLAY_COLOR, weight: 3, opacity: 0.9, interactive: false }))
    const first = pts[0], last = pts[pts.length - 1]
    group.addLayer(L.circleMarker(pos(first), { radius: 5, color: '#0d0f0c', weight: 1, fillColor: COLORS.pmc, fillOpacity: 1 }).bindTooltip('Старт · ' + new Date(first.t).toLocaleTimeString('ru-RU'), { direction: 'top' }))
    group.addLayer(L.circleMarker(pos(last), { radius: 5, color: '#0d0f0c', weight: 1, fillColor: COLORS.boss, fillOpacity: 1 }).bindTooltip('Финиш · ' + new Date(last.t).toLocaleTimeString('ru-RU'), { direction: 'top' }))
    let rot = meta.coordinateRotation ?? 0
    if (rot === 90 || rot === 270) rot += 180
    const deg = replayPoint.r + rot
    const html = `<div style="width:26px;height:26px;transform:translate(-13px,-13px) rotate(${deg}deg);filter:drop-shadow(0 0 4px #000)">
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2 L20 22 L12 17 L4 22 Z" fill="${REPLAY_COLOR}" stroke="#0d0f0c" stroke-width="1.5" stroke-linejoin="round"/></svg></div>`
    const m = L.marker(pos(replayPoint), { icon: L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] }), zIndexOffset: 2100 })
    m.bindTooltip(`<b>Повтор</b><br>${new Date(replayPoint.t).toLocaleTimeString('ru-RU')}`, { direction: 'top', offset: [0, -14] })
    group.addLayer(m)
    group.addTo(map)
    replayRef.current = group
    if (replayFitted.current !== replay.id) {
      replayFitted.current = replay.id
      map.fitBounds(L.latLngBounds(pts.map(pos)).pad(0.3), { maxZoom: meta.maxZoom - 1 })
    } else if (playing && follow) map.panTo(pos(replayPoint), { animate: true })
  }, [replay, replayPoint, gmap, meta, playing, follow])

  // ── «ты здесь» + след ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !meta) return
    posRef.current?.remove()
    posRef.current = null
    if (!playerPos) return
    const group = L.layerGroup()
    if (trail.length > 1) {
      group.addLayer(L.polyline(trail.map(pos), { color: '#f0c46a', weight: 2, opacity: 0.55, dashArray: '2 5', interactive: false }))
      for (const p of trail.slice(0, -1).slice(-40)) group.addLayer(L.circleMarker(pos(p), { radius: 2.5, color: '#f0c46a', weight: 0, fillOpacity: 0.5, interactive: false }))
    }
    let rot = meta.coordinateRotation ?? 0
    if (rot === 90 || rot === 270) rot += 180
    const deg = playerPos.rotation + rot
    const html = `<div style="width:26px;height:26px;transform:translate(-13px,-13px) rotate(${deg}deg);filter:drop-shadow(0 0 4px #000)">
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2 L20 22 L12 17 L4 22 Z" fill="#f0c46a" stroke="#0d0f0c" stroke-width="1.5" stroke-linejoin="round"/></svg></div>`
    const m = L.marker(pos(playerPos), { icon: L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] }), zIndexOffset: 2000 })
    m.bindTooltip(`<b>Ты здесь</b><br>${new Date(playerPos.ts).toLocaleTimeString('ru-RU')}`, { direction: 'top', offset: [0, -14] })
    group.addLayer(m)
    group.addTo(map)
    posRef.current = group
    if (follow) map.panTo(pos(playerPos), { animate: true })
  }, [playerPos, trail, meta, gmap, follow])

  // ── сквад: друзья на этой же карте ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !gmap || !meta) return
    squadRef.current?.remove()
    const group = L.layerGroup()
    let rot = meta.coordinateRotation ?? 0
    if (rot === 90 || rot === 270) rot += 180
    const now = Date.now()
    for (const [name, m] of Object.entries(squadMembers)) {
      if (name === squadName || !m.pos || m.map !== gmap.normalizedName) continue
      const ageMin = (now - m.ts * 1000) / 60000
      const color = m.online ? '#5fd0d0' : '#6a706b'
      const deg = m.pos.rotation + rot
      const html = `<div style="width:24px;height:24px;transform:translate(-12px,-12px);opacity:${ageMin > 3 ? 0.5 : 1}">
        <div style="width:24px;height:24px;transform:rotate(${deg}deg);filter:drop-shadow(0 0 3px #000)"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 2 L20 22 L12 17 L4 22 Z" fill="${color}" stroke="#0d0f0c" stroke-width="1.5" stroke-linejoin="round"/></svg></div>
        <span class="mk-label" style="left:16px;top:2px;color:${color}">${name.replace(/[<>&]/g, '')}</span></div>`
      const mk = L.marker(pos(m.pos), { icon: L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] }), zIndexOffset: 1800 })
      mk.bindTooltip(`<b>${name.replace(/[<>&]/g, '')}</b><br>${new Date(m.ts * 1000).toLocaleTimeString('ru-RU')}`, { direction: 'top', offset: [0, -14] })
      group.addLayer(mk)
    }
    group.addTo(map)
    squadRef.current = group
  }, [squadMembers, squadName, gmap, meta])

  // ── свои метки: правый клик ставит, клик по метке — убирает ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !gmap) return
    const onCtx = (e: L.LeafletMouseEvent) => {
      const name = prompt(squadActive ? 'Метка для сквада (увидят все)' : 'Название метки', '')
      if (name == null) return
      const mark = { id: `m${Date.now().toString(36)}`, x: e.latlng.lng, z: e.latlng.lat, name: name.trim() || 'Метка', ts: Date.now() }
      if (squadActive) void publishSquadMark(squad.url, squad.room, squad.name, { id: mark.id, label: mark.name, x: mark.x, z: mark.z, y: 0, map: gmap.normalizedName })
      else addMark(gmap.id, mark)
    }
    map.on('contextmenu', onCtx)
    return () => { map.off('contextmenu', onCtx) }
  }, [gmap, addMark, squadActive, squad.url, squad.room, squad.name])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !gmap) return
    marksRef.current?.remove()
    const group = L.layerGroup()
    for (const mk of marks[gmap.id] ?? []) {
      const m = L.marker([mk.z, mk.x], { icon: icon('flag', '#e06ba0', mk.name, { size: 18 }), zIndexOffset: 1500 })
      m.bindTooltip(`<b>${mk.name}</b><br><span style="opacity:.7">клик — убрать</span>`, { direction: 'top', offset: [0, -12] })
      m.on('click', () => removeMark(gmap.id, mk.id))
      group.addLayer(m)
    }
    // общие метки сквада — голубые, с автором
    for (const mk of Object.values(squadMarks)) {
      if (mk.map !== gmap.normalizedName) continue
      const m = L.marker([mk.z, mk.x], { icon: icon('flag', '#5fd0d0', `${mk.label} · ${mk.by}`, { size: 18 }), zIndexOffset: 1600 })
      m.bindTooltip(`<b>${mk.label}</b><br>${mk.by} · ${new Date(mk.ts * 1000).toLocaleTimeString('ru-RU')}<br><span style="opacity:.7">клик — убрать у всех</span>`, { direction: 'top', offset: [0, -12] })
      m.on('click', () => { void publishSquadMark(squad.url, squad.room, squad.name, { id: mk.id, label: mk.label, x: mk.x, z: mk.z, y: mk.y, map: mk.map }, true) })
      group.addLayer(m)
    }
    group.addTo(map)
    marksRef.current = group
  }, [marks, squadMarks, gmap, meta, removeMark, squad.url, squad.room, squad.name])

  // квесты с точками на этой карте — список для отслеживания (по алфавиту; отмеченные не всплывают наверх, чтобы случайную галочку снять на том же месте)
  const questsHere = useMemo(() => {
    if (!gmap) return []
    const out: { v: TaskView; points: L.LatLngExpression[] }[] = []
    for (const v of views.values()) {
      if (v.status === 'done' || (questScope === 'available' && v.status !== 'available' && !tracked.has(v.task.id))) continue
      const points: L.LatLngExpression[] = []
      for (const o of v.task.objectives) if (!objectivesDone[o.id]) for (const z of o.zones ?? []) if (z.map === gmap.id) points.push(pos(z.position))
      if (points.length) out.push({ v, points })
    }
    return out.sort((a, b) => a.v.task.name.localeCompare(b.v.task.name, 'ru'))
  }, [gmap, views, questScope, objectivesDone, tracked])
  const [questFilter, setQuestFilter] = useState('')
  const focusQuest = (points: L.LatLngExpression[]) => {
    const map = mapRef.current
    if (!map || !meta || !points.length) return
    map.fitBounds(L.latLngBounds(points).pad(0.6), { maxZoom: meta.maxZoom - 1 })
  }

  // квесты на этой карте, у пунктов которых нет координат (KORD BREACH — целиком, у tarkov.dev — часть): показываем словами
  const questsNoPoint = useMemo(() => {
    if (!gmap) return []
    const out: { v: TaskView; objectives: Objective[] }[] = []
    for (const v of views.values()) {
      if (v.status === 'done' || (questScope === 'available' && v.status !== 'available')) continue
      // у tarkov.dev берём только «местные» пункты (найти/заложить/посетить…), у сезонных — все с этой картой: там и «убить» привязано к месту
      const objectives = v.task.objectives.filter((o) => !objectivesDone[o.id] && o.maps.includes(gmap.id) && !o.zones?.some((z) => z.map === gmap.id)
        && (v.task.seasonal || PLACE_OBJECTIVES.has(o.type)))
      if (objectives.length) out.push({ v, objectives })
    }
    return out.sort((a, b) => Number(!!b.v.task.seasonal) - Number(!!a.v.task.seasonal))
  }, [gmap, views, questScope, objectivesDone])

  const lootTypes = useMemo(() => {
    if (!gmap) return []
    const counts = new Map<string, number>()
    for (const c of gmap.lootContainers) counts.set(c.container, (counts.get(c.container) ?? 0) + 1)
    return [...counts.entries()].map(([id, n]) => ({ id, n, name: data.lootContainerNames[id] ?? id })).sort((a, b) => b.n - a.n)
  }, [gmap, data])

  const highlightTask = taskParam ? data.tasks[taskParam] : null
  const highlightKey = keyParam ? data.items[keyParam] : null
  const highlightItem = itemParam ? data.items[itemParam] : null

  return (
    <div className="h-full relative flex">
      <div ref={containerRef} className="flex-1 min-w-0 h-full" />

      {/* контекст из ссылки: квест / ключ / предмет */}
      {(highlightTask || highlightKey || highlightItem) && (
        <div className="absolute left-3 top-3 z-[500] panel glass px-3 py-2 flex items-center gap-3 shadow-[0_10px_30px_rgba(0,0,0,.5)] max-w-[420px]">
          {highlightItem && <ItemCell item={highlightItem} size={32} />}
          {highlightKey && <ItemCell item={highlightKey} size={32} />}
          <div className="min-w-0 text-[13px]">
            {highlightTask && <><Eyebrow>Квест</Eyebrow><div className="truncate">{highlightTask.name}</div></>}
            {highlightKey && <><Eyebrow>Ключ открывает</Eyebrow><div className="truncate">{highlightKey.name}</div></>}
            {highlightItem && (
              <>
                <Eyebrow>Где может лежать</Eyebrow>
                <div className="truncate">{highlightItem.name}</div>
                {itemSpots && itemSpots.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {itemSpots.map((s) => (
                      <button key={s.map.id} type="button" onClick={() => setMapIdWhy(s.map.id, 'item-chip')} className={`chip ${s.map.id === mapId ? 'chip-on' : ''}`}>{s.map.name} <span className="num opacity-70">{s.points.length}</span></button>
                    ))}
                  </div>
                ) : <div className="text-ink-3 text-[12px]">Точек россыпного лута нет — ищи в контейнерах или у торговцев</div>}
              </>
            )}
          </div>
          <button type="button" onClick={clearParams} className="p-1 text-ink-3 hover:text-ink" aria-label="Убрать"><X size={16} /></button>
        </div>
      )}

      {/* повтор рейда */}
      {raidParam && (
        <div className="absolute left-3 bottom-3 z-[500] panel glass px-3 py-2 flex flex-col gap-1.5 shadow-[0_10px_30px_rgba(0,0,0,.5)] w-[360px] max-w-[calc(100%-24px)]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: REPLAY_COLOR }} />
            <div className="min-w-0 flex-1 text-[13px]">
              <Eyebrow>Повтор рейда</Eyebrow>
              <div className="truncate">
                {replay ? `${data.maps[replay.mapId]?.name ?? 'Карта?'} · ${new Date(replay.start).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${replay.n} точек` : 'загружаю…'}
              </div>
            </div>
            <button type="button" onClick={clearParams} className="p-1 text-ink-3 hover:text-ink" aria-label="Закрыть"><X size={16} /></button>
          </div>
          {replay && replay.mapId !== gmap?.id && <div className="text-[11px] text-scav">Трек с другой карты — переключи карту на {data.maps[replay.mapId]?.name ?? '…'}</div>}
          {replay && replay.points.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setReplayT(0); setPlaying(false) }} className="p-1 text-ink-3 hover:text-ink" title="В начало"><SkipBack size={14} /></button>
                <button type="button" onClick={() => { if (replayT >= replayDur) setReplayT(0); setPlaying(!playing) }} className="w-8 h-8 grid place-items-center rounded-[4px] border border-brass-3 text-brass-2 bg-brass/10 hover:bg-brass/20" title={playing ? 'Пауза' : 'Играть'}>
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <input type="range" min={0} max={Math.max(1, replayDur)} step={1000} value={replayT} onChange={(e) => { setReplayT(Number(e.target.value)); setPlaying(false) }} className="flex-1" />
                <span className="num text-[12px] text-ink-2 whitespace-nowrap">{fmtClock(replayT)} / {fmtClock(replayDur)}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-ink-3">
                скорость
                {REPLAY_SPEEDS.map((sp) => <button key={sp} type="button" onClick={() => setSpeed(sp)} className={`chip h-5 px-2 ${speed === sp ? 'chip-on' : ''}`}>×{sp}</button>)}
                {replayPoint && <span className="ml-auto num">{new Date(replayPoint.t).toLocaleTimeString('ru-RU')} · h {replayPoint.y.toFixed(0)}</span>}
              </div>
            </>
          )}
        </div>
      )}

      {/* панель управления */}
      <button
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-[510] h-14 w-5 grid place-items-center bg-bg-2 border border-r-0 border-line rounded-l text-ink-3 hover:text-ink"
        style={{ right: panelOpen ? (overlay ? 220 : 280) : 0 }}
        aria-label={panelOpen ? 'Скрыть панель' : 'Показать панель'}
      >
        {panelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
      {panelOpen && (
        <aside className={`absolute right-0 top-0 bottom-0 z-[500] overflow-y-auto border-l border-line glass flex flex-col gap-4 p-3 ${overlay ? 'w-[220px]' : 'w-[280px]'}`}>
          <div>
            <Eyebrow>Карта</Eyebrow>
            <div className="mt-1.5">
              <MapPicker maps={mapsWithMeta} value={mapId} onPick={pickMap} />
            </div>
            {gmap && (
              <div className="mt-2 text-[12px] text-ink-3 num">
                {gmap.raidDuration} мин · {gmap.players} игроков
              </div>
            )}
          </div>

          {meta?.svgPath && meta.tilePath && (
            <div>
              <Eyebrow>Подложка</Eyebrow>
              <div className="mt-1.5"><Segmented value={mapStyle} onChange={setMapStyle} options={[{ value: 'scheme', label: 'Схема' }, { value: 'render', label: 'Рендер' }]} /></div>
            </div>
          )}

          {meta && meta.layers.length > 0 && (
            <div>
              <Eyebrow>Этаж</Eyebrow>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <button type="button" onClick={() => setFloor(-1)} className={`chip ${floor === -1 ? 'chip-on' : 'hover:text-ink'}`}>Основной</button>
                {meta.layers.map((l, i) => (
                  <button key={l.name} type="button" onClick={() => setFloor(i)} className={`chip ${floor === i ? 'chip-on' : 'hover:text-ink'}`}>{floorName(l.name)}</button>
                ))}
              </div>
            </div>
          )}

          <div>
              <Eyebrow>Квесты на карте</Eyebrow>
              <div className="mt-1.5"><Segmented value={questScope} onChange={setQuestScope} options={[{ value: 'available', label: 'Доступные' }, { value: 'all', label: 'Все' }]} /></div>
              {questsHere.length > 0 && (
                <div className="mt-2">
                  {questsHere.length > 8 && (
                    <input value={questFilter} onChange={(e) => setQuestFilter(e.target.value)} placeholder="Найти квест…" className="input focus:input-focus h-7 text-[12px] w-full mb-1" />
                  )}
                  <ul className="flex flex-col gap-px">
                    {questsHere.filter(({ v }) => !questFilter || v.task.name.toLowerCase().includes(questFilter.toLowerCase())).map(({ v, points }) => {
                      const on = tracked.has(v.task.id)
                      const trader = data.traders[v.task.trader]
                      const qc = v.task.seasonal ? COLORS.season : COLORS.quest
                      return (
                        <li key={v.task.id} className={`layer-row h-7 pr-1 ${on ? 'layer-on' : ''}`} style={on ? { borderColor: qc } : undefined}>
                          <button type="button" onClick={() => toggleTracked(v.task.id)} title={on ? 'Не отслеживать' : 'Отслеживать на карте'}
                            className={`shrink-0 w-3.5 h-3.5 rounded-sm border grid place-items-center ${on ? 'border-brass bg-brass text-bg' : 'border-line-2 hover:border-brass'}`}>
                            {on && <Check size={10} strokeWidth={3} />}
                          </button>
                          {trader?.imageLink && <img src={trader.imageLink} alt="" title={trader.name} className="w-4 h-4 rounded-sm shrink-0 object-cover" />}
                          <button type="button" onClick={() => toggleTracked(v.task.id)} className={`truncate flex-1 text-left text-[12px] ${on ? 'text-ink' : ''}`}>{v.task.name.replace(' [KORD BREACH]', '')}</button>
                          <span className="num text-[11px]">{points.length}</span>
                          <button type="button" onClick={() => focusQuest(points)} title="Показать на карте" className="shrink-0 text-ink-4 hover:text-brass"><Crosshair size={12} /></button>
                        </li>
                      )
                    })}
                  </ul>
                  {trackedTasks.length > 0 && (
                    <button type="button" onClick={clearTracked} className="mt-1 text-[11px] text-ink-3 hover:text-ink">Сбросить выбор ({trackedTasks.length})</button>
                  )}
                  <div className="mt-1 text-[11px] text-ink-4">Отметь квест — его точки загорятся на карте, остальные приглушатся; они видны и при выключенном слое «Мои квесты». Прицел — навести карту.</div>
                </div>
              )}
              {toggles.quests && questsNoPoint.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] text-ink-4 mb-1">Без точки на карте — где искать, словами:</div>
                  <ul className="flex flex-col gap-1.5">
                    {questsNoPoint.map(({ v, objectives }) => (
                      <li key={v.task.id} className="text-[12px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: v.task.seasonal ? COLORS.season : COLORS.quest }} />
                          <span className={`truncate ${v.task.seasonal ? 'text-season' : 'text-ink'}`}>{v.task.name.replace(' [KORD BREACH]', '')}</span>
                        </div>
                        <ul className="ml-3.5 mt-0.5 flex flex-col gap-0.5">
                          {objectives.map((o) => (
                            <li key={o.id} className="flex items-start gap-1.5 text-ink-3">
                              <button type="button" title="Пункт выполнен" onClick={() => toggleObjective(o.id, true)} className="shrink-0 mt-[3px] w-3 h-3 rounded-sm border border-line-2 hover:border-brass" />
                              <span>{o.description}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Eyebrow>Слои</Eyebrow>
              <div className="flex gap-2 text-[11px]">
                <button type="button" onClick={() => setToggles(allToggles(true))} className="text-ink-3 hover:text-ink">все</button>
                <button type="button" onClick={() => setToggles(allToggles(false))} className="text-ink-3 hover:text-ink">ничего</button>
              </div>
            </div>
            <div className="mt-1.5 flex flex-col gap-2.5">
              {LAYER_SECTIONS.map((sec) => {
                const isOpen = !collapsed[sec.title]
                const activeN = sec.rows.filter((r) => toggles[r.key] && layerCounts[r.key] > 0).length
                return (
                <div key={sec.title}>
                  <button type="button" onClick={() => setCollapsed({ ...collapsed, [sec.title]: isOpen })}
                    className="w-full flex items-center gap-1 eyebrow text-[10px] text-ink-4 hover:text-ink-2 mb-0.5">
                    <ChevronDown size={11} className={`transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    <span className="flex-1 text-left">{sec.title}</span>
                    {!isOpen && activeN > 0 && <span className="num text-[10px] text-brass">{activeN}</span>}
                  </button>
                  {isOpen && <div className="flex flex-col gap-px">
                    {sec.rows.map(({ key, label, color, icon: ic }) => {
                      const n = layerCounts[key]
                      const on = toggles[key] && n > 0
                      return (
                        <div key={key}>
                          <button
                            type="button" disabled={n === 0} onClick={() => setToggles({ ...toggles, [key]: !toggles[key] })}
                            className={`layer-row ${on ? 'layer-on' : ''}`} style={on ? { borderColor: color } : undefined}
                          >
                            <span className="layer-ic" style={{ color }}>
                              {ic === 'dot' ? <span className="w-2 h-2 rounded-full" style={{ background: color }} /> : <span dangerouslySetInnerHTML={{ __html: MARKER_SVG[ic] }} />}
                            </span>
                            <span className="truncate flex-1 text-left">{label}</span>
                            <span className="num text-[11px]">{n}</span>
                          </button>
                          {key === 'loose' && on && (
                            <div className="ml-6 mt-1 mb-1 flex flex-col gap-px">
                              {LOOSE_CATEGORIES.map((c) => {
                                const cn = loosePoints[c.id]?.length ?? 0
                                return (
                                  <button key={c.id} type="button" disabled={cn === 0} onClick={() => setLooseCat(c.id)}
                                    className={`layer-row h-6 text-[12px] ${looseCat === c.id ? 'layer-on' : ''}`} style={looseCat === c.id ? { borderColor: c.id === 'needed' ? COLORS.quest : COLORS.item } : undefined}>
                                    <span className="truncate flex-1 text-left">{c.label}</span>
                                    <span className="num text-[11px]">{cn}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {key === 'keycards' && on && (
                            <div className="ml-6 mt-1 mb-1 flex flex-col gap-px">
                              <button type="button" onClick={() => setKeycardSel('')} className={`layer-row h-6 text-[12px] ${keycardSel === '' ? 'layer-on' : ''}`} style={keycardSel === '' ? { borderColor: color } : undefined}>
                                <span className="truncate flex-1 text-left">Все карты</span>
                                <span className="num text-[11px]">{cardPoints.length}</span>
                              </button>
                              {cardsHere.map((k) => (
                                <button key={k.id} type="button" onClick={() => setKeycardSel(k.id)} className={`layer-row h-6 text-[12px] ${keycardSel === k.id ? 'layer-on' : ''}`} style={keycardSel === k.id ? { borderColor: k.color } : undefined}>
                                  <span className="layer-ic" style={{ color: k.color }}><span dangerouslySetInnerHTML={{ __html: MARKER_SVG.card }} /></span>
                                  <span className="truncate flex-1 text-left">{k.label}</span>
                                  <span className="num text-[11px]">{cardCounts[k.id]}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {key === 'bpDocs' && on && (
                            <div className="ml-6 mt-1 mb-1 flex flex-col gap-px">
                              <button type="button" onClick={() => setBpDocSel('')} className={`layer-row h-6 text-[12px] ${bpDocSel === '' ? 'layer-on' : ''}`} style={bpDocSel === '' ? { borderColor: color } : undefined}>
                                <span className="truncate flex-1 text-left">Все документы</span>
                                <span className="num text-[11px]">{bpDocPoints.length + kordExtra.length}</span>
                              </button>
                              {docsHere.map((id) => (
                                <button key={id} type="button" onClick={() => setBpDocSel(id)} className={`layer-row h-6 text-[12px] ${bpDocSel === id ? 'layer-on' : ''}`} style={bpDocSel === id ? { borderColor: COLORS.season } : undefined}>
                                  <span className="truncate flex-1 text-left">{data.items[id]?.shortName ?? id}</span>
                                  <span className="num text-[11px]">{bpDocPoints.filter((l) => l.items.includes(id)).length + kordExtra.filter((s) => s.doc === id).length}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {key === 'containers' && on && (
                            <div className="ml-6 mt-1 mb-1 flex flex-col gap-px">
                              <button type="button" onClick={() => setLootType('')} className={`layer-row h-6 text-[12px] ${lootType === '' ? 'layer-on' : ''}`} style={lootType === '' ? { borderColor: color } : undefined}>
                                <span className="truncate flex-1 text-left">Все типы</span>
                                <span className="num text-[11px]">{gmap?.lootContainers.length ?? 0}</span>
                              </button>
                              {lootTypes.map((t) => {
                                const ci = containerIcon(data.lootContainerTypes[t.id] ?? '')
                                return (
                                  <button key={t.id} type="button" onClick={() => setLootType(t.id)} className={`layer-row h-6 text-[12px] ${lootType === t.id ? 'layer-on' : ''}`} style={lootType === t.id ? { borderColor: ci.color } : undefined}>
                                    <span className="layer-ic" style={{ color: ci.color }}><span dangerouslySetInnerHTML={{ __html: MARKER_SVG[ci.kind] }} /></span>
                                    <span className="truncate flex-1 text-left">{t.name}</span>
                                    <span className="num text-[11px]">{t.n}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>}
                </div>
                )
              })}
            </div>
            <div className="mt-2 pt-2 border-t border-line flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
              {LEGEND.map((l) => <span key={l.label} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: l.color }} />{l.label}</span>)}
            </div>
          </div>

          {standalone && !live && <WindowPanel />}

          {!live && (
            <>
              <PositionPanel
                cardinalRotation={gmap?.coordinateToCardinalRotation ?? 0}
                floorName={meta?.layers[floor] ? floorName(meta.layers[floor].name) : null}
              />
              <div className="text-[11px] text-ink-4">Правый клик по карте — своя метка, клик по метке — убрать.</div>
            </>
          )}

          {gmap && gmap.bosses.length > 0 && (
            <div>
              <Eyebrow>Боссы</Eyebrow>
              <ul className="mt-1.5 flex flex-col gap-1 text-[13px]">
                {gmap.bosses.map((b, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="text-ink-2 truncate">{b.name}</span>
                    <span className="num text-ink-3">{Math.round(b.spawnChance * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {meta?.author && (
            <div className="mt-auto text-[11px] text-ink-4">
              Карта: <a href={meta.authorLink} target="_blank" rel="noreferrer" className="hover:text-ink-2">{meta.author}</a> · данные tarkov.dev
            </div>
          )}
          {!overlay && !standalone && !live && (
            <Chip onClick={() => useUI.getState().setOverlay(true)} className="justify-center">Режим оверлея</Chip>
          )}
        </aside>
      )}
    </div>
  )
}

/** Окно карты (F7): прозрачность окна — через лаунчер (Form.Opacity), значение хранится в config.json. */
function WindowPanel() {
  const launcher = useLauncher()
  const [opacity, setOpacity] = useState(1)
  useEffect(() => { launcher?.get_state().then((s) => setOpacity(s.map_opacity ?? 1)).catch(() => {}) }, [launcher])
  if (!launcher?.set_map_opacity) return null
  const apply = (v: number) => { setOpacity(v); launcher.set_map_opacity?.(v).catch(() => {}) }
  return (
    <div>
      <Eyebrow>Окно</Eyebrow>
      <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-3">
        <span>Прозрачность</span>
        <input type="range" min={20} max={100} step={5} value={Math.round(opacity * 100)} onChange={(e) => apply(Number(e.target.value) / 100)} className="flex-1" />
        <span className="num w-9 text-right text-ink-2">{Math.round(opacity * 100)}%</span>
      </div>
      <div className="mt-1 text-[11px] text-ink-4">F7 — показать/скрыть окно. Закрыть — крестиком.</div>
    </div>
  )
}

function floorName(n: string): string {
  const m: Record<string, string> = {
    '2nd Floor': '2 этаж', '3rd Floor': '3 этаж', '4th Floor': '4 этаж', '5th Floor': '5 этаж',
    'Underground': 'Подвал', 'Garage': 'Гараж', 'Tunnels': 'Тоннели', 'Bunkers': 'Бункеры',
    'Second Level': '2 уровень', 'Technical': 'Технический',
  }
  return m[n] ?? n
}
