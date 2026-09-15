import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import { ChevronLeft, ChevronRight, ChevronDown, X, Play, Pause, SkipBack } from 'lucide-react'
import { useGame } from '@/store/data'
import { useUI } from '@/store/ui'
import { useProfile } from '@/store/profile'
import { useRaids, type Raid } from '@/store/raids'
import { useTaskViews } from '@/lib/useCtx'
import { findMeta } from '@/data/mapMeta'
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

const MAP_ORDER = ['customs', 'factory', 'woods', 'shoreline', 'interchange', 'reserve', 'lighthouse', 'streets-of-tarkov', 'ground-zero', 'the-lab', 'the-labyrinth', 'terminal', 'icebreaker', 'night-factory', 'ground-zero-21', 'the-lab-dark']

type ToggleKey =
  | 'exitsPmc' | 'exitsScav' | 'exitsShared' | 'transits'
  | 'quests'
  | 'spawnsPmc' | 'spawnsScav' | 'snipers' | 'spawnsSeason' | 'bosses'
  | 'locks' | 'keySpawns' | 'keycards' | 'ledx'
  | 'containers' | 'loose'
  | 'hazards' | 'switches' | 'weapons' | 'btr'
type Toggles = Record<ToggleKey, boolean>

const DEFAULT_TOGGLES: Toggles = {
  exitsPmc: true, exitsScav: false, exitsShared: true, transits: true,
  quests: true,
  spawnsPmc: true, spawnsScav: false, snipers: false, spawnsSeason: true, bosses: true,
  locks: true, keySpawns: false, keycards: false, ledx: false,
  containers: false, loose: false,
  hazards: true, switches: false, weapons: false, btr: true,
}

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

const LEGEND: { label: string; color: string }[] = [
  { label: 'ЧВК', color: COLORS.pmc }, { label: 'Дикие', color: COLORS.scav }, { label: 'Общий', color: COLORS.shared },
  { label: 'Переход', color: COLORS.transit }, { label: 'Квест', color: COLORS.quest }, { label: 'Сезон', color: COLORS.season },
]

/** категории рассыпного лута — по категориям предметов tarkov.dev (id ветки; предмет попадает, если ветка среди его categories) */
const LOOSE_CATEGORIES: { id: string; label: string; cats?: string[] }[] = [
  { id: 'all', label: 'Весь лут' },
  { id: 'needed', label: 'Нужное мне' },
  { id: 'barter', label: 'Ценности и бартер', cats: ['5448eb774bdc2d0a728b4567', '5448ecbe4bdc2d60728b4568'] },
  { id: 'cases', label: 'Кейсы', cats: ['566162e44bdc2d3f298b4573'] },
  { id: 'keys', label: 'Ключи', cats: ['5c99f98d86f7745c314214b3'] },
  { id: 'meds', label: 'Медицина', cats: ['543be5664bdc2dd4348b4569'] },
  { id: 'food', label: 'Еда и вода', cats: ['543be6674bdc2df1348b4569'] },
  { id: 'other', label: 'Прочее' },
]
/** механические ключи (ветка mechanical-key); ключ-карты — отдельная ветка keycard, в «ключах» их нет */
const KEY_CATEGORY = '5c99f98d86f7745c314214b3'
const KEYCARD_CATEGORY = '5c164d2286f774194c5e69fa'
/** ключ-карты: свой цвет у каждой; порядок — по ценности (в точке с несколькими картами маркер красится по первой) */
const KEYCARDS: { id: string; label: string; color: string }[] = [
  { id: '5c1d0efb86f7744baf2e7b7b', label: 'Красная', color: '#e04b4b' },
  { id: '5c1d0f4986f7744bb01837fa', label: 'Чёрная', color: '#3a3f47' },
  { id: '5c1e495a86f7743109743dfb', label: 'Фиолетовая', color: '#a05be0' },
  { id: '5c1d0c5f86f7744bb2683cf0', label: 'Синяя', color: '#4b8be0' },
  { id: '5c1d0dc586f7744baf2e7b79', label: 'Зелёная', color: '#4bc46b' },
  { id: '5c1d0d6d86f7744bb2683e1f', label: 'Жёлтая', color: '#e8c84b' },
  { id: '5c94bbff86f7747ee735c08f', label: 'Доступ в Лабораторию', color: '#5fd0d0' },
  { id: '6711039f9e648049e50b3307', label: 'Жилой блок (Лаборатория)', color: '#7c8a80' },
  { id: '5e42c81886f7742a01529f57', label: 'Объект #11SR', color: '#e08a3c' },
  { id: '5e42c83786f7742a021fdf3c', label: 'Объект #21WS', color: '#d66fb0' },
]
const KEYCARD_COLORS = Object.fromEntries(KEYCARDS.map((k) => [k.id, k.color]))
const isKeycard = (it: { categories: string[] } | undefined) => !!it?.categories.includes(KEYCARD_CATEGORY)
const LEDX = '5c0530ee86f774697952d952'
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
  const setCurrentMapId = useUI((s) => s.setCurrentMapId)
  const squadRef = useRef<L.LayerGroup | null>(null)
  const [params, setParams] = useSearchParams()

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
    return mapsWithMeta[0]?.id
  })
  useEffect(() => {
    if (itemSpots?.length && !paramMap) setMapId(itemSpots[0].map.id)
  }, [itemSpots, paramMap])
  useEffect(() => {
    if (replay?.mapId && data.maps[replay.mapId] && findMeta(data.maps[replay.mapId].normalizedName)) setMapId(replay.mapId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay])
  // телефон: едем за картой хоста
  useEffect(() => {
    if (!live?.hostMap) return
    const m = mapsWithMeta.find((x) => x.normalizedName === live.hostMap)
    if (m && m.id !== mapId) setMapId(m.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.hostMap])
  useEffect(() => {
    const byParam = paramMap && mapsWithMeta.find((m) => m.normalizedName === paramMap)
    if (byParam && byParam.id !== mapId) setMapId(byParam.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramMap])

  const gmap = data.maps[mapId]
  const meta = gmap ? findMeta(gmap.normalizedName) : undefined
  useEffect(() => { setCurrentMapId(mapId ?? null) }, [mapId, setCurrentMapId])
  // сквад переключил общую карту — идём за ним
  useEffect(() => {
    if (squadActive && squad.followMap && currentMapId && currentMapId !== mapId && data.maps[currentMapId]) { setMapId(currentMapId); if (paramMap) clearParams() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMapId])
  const pickMap = (id: string) => {
    setMapId(id)
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
    z.containers = gmap.lootContainers.length
    z.loose = gmap.lootLoose.length
    z.hazards = gmap.hazards.length
    z.switches = gmap.switches.length
    z.weapons = gmap.stationaryWeapons.length
    z.btr = gmap.btrStops.filter((b) => b.position).length
    for (const v of views.values()) {
      if (v.status === 'done' || (questScope === 'available' && v.status !== 'available')) continue
      for (const o of v.task.objectives) for (const zz of o.zones ?? []) if (zz.map === gmap.id && !objectivesDone[o.id]) z.quests++
    }
    return z
  }, [gmap, data, gameMode, loosePoints, cardPoints, ledxPoints, views, questScope, objectivesDone])
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
    if (toggles.quests || taskParam) {
      const zoneBounds: L.LatLngExpression[] = []
      const questZones: { v: TaskView; o: Objective; z: Zone }[] = []
      for (const v of views.values()) {
        if (taskParam ? v.task.id !== taskParam : (v.status === 'done' || (questScope === 'available' && v.status !== 'available'))) continue
        // выполненные пункты прячем; в режиме «показать задание» оставляем их бледными, чтобы можно было вернуть
        for (const o of v.task.objectives) for (const z of o.zones ?? []) if (z.map === gmap.id && (taskParam || !objectivesDone[o.id])) questZones.push({ v, o, z })
      }
      // при большом числе зон подписи только по наведению — иначе каша
      const withLabels = questZones.length <= 14 || !!taskParam
      // всплывашка с кнопками: отметить пункт / всё задание. Реальные DOM-узлы — с обработчиками, без innerHTML
      const popupFor = (v: TaskView, o: Objective, isDone: boolean) => {
        const el = document.createElement('div')
        el.className = 'qpop'
        const zoneObjs = v.task.objectives.filter((x) => x.zones?.length)
        const doneCount = zoneObjs.filter((x) => objectivesDone[x.id]).length
        const add = (tag: string, cls: string, text: string) => { const n = document.createElement(tag); n.className = cls; n.textContent = text; el.appendChild(n); return n }
        const head = add('div', 'qpop-head', '')
        const trader = data.traders[v.task.trader]
        if (trader?.imageLink) { const im = document.createElement('img'); im.src = trader.imageLink; im.alt = ''; im.title = trader.name; im.className = 'qpop-trader'; head.appendChild(im) }
        const title = document.createElement('div'); title.className = 'qpop-title'; title.textContent = v.task.name; head.appendChild(title)
        add('div', 'qpop-desc', o.description)
        if (o.approx) add('div', 'qpop-meta', '≈ координаты приближённые (сняты с карты вики) — смотри скрины')
        if (zoneObjs.length > 1) add('div', 'qpop-meta', `пунктов на картах: ${doneCount} / ${zoneObjs.length}${isDone ? ' · этот выполнен' : ''}`)
        if (o.pics?.length) renderWikiPics(el, o.pics)
        const row = add('div', 'qpop-actions', '')
        const btn = (text: string, cls: string, fn: () => void) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text
          b.onclick = (e) => { e.stopPropagation(); map.closePopup(); fn() }
          row.appendChild(b)
        }
        if (!isDone) btn('✓ Пункт выполнен', 'chip chip-on', () => toggleObjective(o.id, true))
        else btn('Вернуть пункт', 'chip', () => toggleObjective(o.id, false))
        btn('Задание выполнено', 'chip', () => toggleTask(v.task.id, true))
        return el
      }
      for (const { v, o, z } of questZones) {
        const isDone = !!objectivesDone[o.id]
        const dim = !onLevel(z.position) || isDone
        const qc = v.task.seasonal ? COLORS.season : COLORS.quest
        if (z.outline?.length) group.addLayer(L.polygon(z.outline.map(pos), { color: qc, weight: 1, fillOpacity: dim ? 0.04 : 0.1, interactive: false }))
        const label = withLabels ? (o.approx ? `≈ ${v.task.name}` : v.task.name) : undefined
        const m = L.marker(pos(z.position), { icon: icon('flag', qc, label, { size: 20, dim }) })
        tip(m, `<b>${v.task.name}</b><br>${o.description}<br><span style="opacity:.6">${o.approx ? '≈ точка приближённая · ' : ''}${isDone ? 'пункт выполнен · ' : ''}клик — подробности</span>`)
        m.bindPopup(() => popupFor(v, o, isDone), { closeButton: false, offset: [0, -10], className: 'qpop-wrap', maxWidth: 360 })
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
  }, [gmap, meta, floor, toggles, questScope, lootType, looseCat, loosePoints, cardPoints, cardsHere, keycardSel, ledxPoints, neededIds, views, data, taskParam, keyParam, itemParam, itemSpots, openItem, gameMode, objectivesDone, toggleObjective, toggleTask])

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
                      <button key={s.map.id} type="button" onClick={() => setMapId(s.map.id)} className={`chip ${s.map.id === mapId ? 'chip-on' : ''}`}>{s.map.name} <span className="num opacity-70">{s.points.length}</span></button>
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
            <div className="mt-1.5 flex flex-wrap gap-1">
              {mapsWithMeta.map((m) => (
                <button key={m.id} type="button" onClick={() => pickMap(m.id)}
                  className={`chip ${m.id === mapId ? 'chip-on' : 'hover:text-ink hover:border-ink-4'}`}>{m.name}</button>
              ))}
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

          {toggles.quests && (
            <div>
              <Eyebrow>Квесты на карте</Eyebrow>
              <div className="mt-1.5"><Segmented value={questScope} onChange={setQuestScope} options={[{ value: 'available', label: 'Доступные' }, { value: 'all', label: 'Все' }]} /></div>
              {questsNoPoint.length > 0 && (
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
