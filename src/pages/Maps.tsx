import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useGame } from '@/store/data'
import { useUI } from '@/store/ui'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import { findMeta, type MapMeta } from '@/data/mapMeta'
import { makeCRS, pos, boundsOf, scaledBounds, icon, dot, COLORS } from '@/lib/leaflet'
import { fleaPrice } from '@/lib/flea'
import { extractsOf, FACTION_RU } from '@/lib/extracts'
import { TRANSIT_NOTE } from '@/data/extractRules'
import { rubShort } from '@/lib/format'
import type { GameMap, Objective, XYZ, Zone } from '@/data/types'
import type { TaskView } from '@/lib/tasks'
import { Chip, Eyebrow, Segmented } from '@/components/ui'
import { PositionPanel } from '@/components/PositionPanel'
import { SquadPanel } from '@/components/SquadPanel'
import { publishSquadMap, publishSquadMark, ROOM_RE } from '@/lib/squad'
import { floorForPosition } from '@/lib/floors'
import { ItemCell } from '@/components/ItemCell'

const MAP_ORDER = ['customs', 'factory', 'woods', 'shoreline', 'interchange', 'reserve', 'lighthouse', 'streets-of-tarkov', 'ground-zero', 'the-lab', 'the-labyrinth', 'terminal', 'icebreaker', 'night-factory', 'ground-zero-21', 'the-lab-dark']

type ToggleKey = 'extracts' | 'spawnsPmc' | 'spawnsScav' | 'spawnsSeason' | 'bosses' | 'locks' | 'hazards' | 'transits' | 'switches' | 'btr' | 'weapons' | 'loot' | 'quests'
type Toggles = Record<ToggleKey, boolean>

const DEFAULT_TOGGLES: Toggles = {
  extracts: true, spawnsPmc: true, spawnsScav: false, spawnsSeason: true, bosses: true, locks: true, hazards: true,
  transits: true, switches: false, btr: true, weapons: false, loot: false, quests: true,
}

const allToggles = (v: boolean): Toggles =>
  Object.fromEntries(Object.keys(DEFAULT_TOGGLES).map((k) => [k, v])) as Toggles

const TOGGLE_LABELS: { key: ToggleKey; label: string; color: string }[] = [
  { key: 'extracts', label: 'Выходы', color: COLORS.shared },
  { key: 'transits', label: 'Транзиты', color: COLORS.transit },
  { key: 'spawnsPmc', label: 'Спавны ЧВК', color: COLORS.pmc },
  { key: 'spawnsScav', label: 'Спавны диких', color: COLORS.scav },
  { key: 'spawnsSeason', label: 'Сезонные спавны', color: COLORS.season },
  { key: 'bosses', label: 'Боссы', color: COLORS.boss },
  { key: 'locks', label: 'Двери и ключи', color: COLORS.key },
  { key: 'hazards', label: 'Опасности', color: COLORS.hazard },
  { key: 'quests', label: 'Мои квесты', color: COLORS.quest },
  { key: 'switches', label: 'Рубильники', color: COLORS.switch },
  { key: 'btr', label: 'БТР', color: COLORS.btr },
  { key: 'weapons', label: 'Стационарки', color: COLORS.weapon },
  { key: 'loot', label: 'Контейнеры', color: COLORS.loot },
]

export function MapsPage() {
  const data = useGame()
  const views = useTaskViews()
  const overlay = useUI((s) => s.overlay)
  const openItem = useUI((s) => s.openItem)
  const gameMode = useProfile((s) => s.gameMode)
  const playerPos = useUI((s) => s.playerPos)
  const trail = useUI((s) => s.trail)
  const follow = useUI((s) => s.followPlayer)
  const autoFloor = useUI((s) => s.autoFloor)
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

  const [toggles, setToggles] = useState<Toggles>(() => {
    try { return { ...DEFAULT_TOGGLES, ...JSON.parse(localStorage.getItem('sherpa:mapToggles') ?? '{}') } } catch { return DEFAULT_TOGGLES }
  })
  useEffect(() => { try { localStorage.setItem('sherpa:mapToggles', JSON.stringify(toggles)) } catch { /* ignore */ } }, [toggles])
  const [floor, setFloor] = useState<number>(-1)
  const [questScope, setQuestScope] = useState<'available' | 'all'>('available')
  const [lootType, setLootType] = useState<string>('')
  const [panelOpen, setPanelOpen] = useState(!overlay)
  useEffect(() => { setFloor(-1) }, [mapId])

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
      maxBounds: scaledBounds(meta.bounds, 1.5), maxBoundsViscosity: 0.6,
    })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map
    const bounds = boundsOf(meta.bounds)
    const base: typeof baseRef.current = {}
    const tileSize = meta.tileSize ?? 256
    if (meta.tilePath) {
      base.tile = L.tileLayer(meta.tilePath, { tileSize, bounds, minNativeZoom: meta.minZoom, maxNativeZoom: meta.maxZoom, maxZoom, className: 'base-tiles' }).addTo(map)
    }
    if (meta.svgPath && !meta.tilePath) {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      base.svgEl = svgEl
      base.svg = L.svgOverlay(svgEl, meta.svgBounds ? boundsOf(meta.svgBounds) : bounds, { className: 'base-svg' }).addTo(map)
      fetch(meta.svgPath).then((r) => r.text()).then((txt) => {
        svgEl.innerHTML = txt
        const inner = svgEl.children[0] as SVGSVGElement | undefined
        if (inner?.getAttribute('viewBox')) svgEl.setAttribute('viewBox', inner.getAttribute('viewBox')!)
        applySvgFloor(svgEl, meta, -1)
      }).catch(() => { /* карта без подложки — маркеры всё равно видны */ })
    }
    baseRef.current = base
    markersRef.current = L.layerGroup().addTo(map)
    map.fitBounds(bounds, { animate: false })
    // контейнер мог ещё не получить размер — подгоняем после раскладки
    const raf = requestAnimationFrame(() => { map.invalidateSize(false); map.fitBounds(bounds, { animate: false }) })
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
  }, [gmap, meta])

  // ── этажи ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !meta) return
    const base = baseRef.current
    base.floorTile?.remove()
    base.floorTile = undefined
    const layer = floor >= 0 ? meta.layers[floor] : undefined
    if (layer?.tilePath) {
      const maxZoom = Math.max(7, meta.maxZoom)
      base.floorTile = L.tileLayer(layer.tilePath, { tileSize: meta.tileSize ?? 256, bounds: boundsOf(meta.bounds), minNativeZoom: meta.minZoom, maxNativeZoom: meta.maxZoom, maxZoom }).addTo(map)
      base.floorTile.bringToFront()
    }
    base.tile?.getContainer()?.classList.toggle('off-level', !!layer && !layer.show)
    if (base.svgEl) applySvgFloor(base.svgEl, meta, floor)
  }, [floor, meta])

  // ── маркеры ──
  useEffect(() => {
    const map = mapRef.current
    const group = markersRef.current
    if (!map || !group || !gmap || !meta) return
    group.clearLayers()

    const layer = floor >= 0 ? meta.layers[floor] : undefined
    const range: [number, number] | undefined = layer?.extents?.[0]?.height ?? (floor === -1 ? meta.heightRange : undefined)
    const onLevel = (p: XYZ) => !range || (p.y >= range[0] && p.y <= range[1])
    const tip = (m: L.Layer, html: string, opts: L.TooltipOptions = {}) => m.bindTooltip(html, { direction: 'top', offset: [0, -12], ...opts })

    if (toggles.extracts) {
      for (const x of extractsOf(data, gmap, gameMode)) {
        const e = x.extract
        if (!e) continue
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
    if (toggles.spawnsPmc || toggles.spawnsScav || toggles.spawnsSeason) {
      for (const s of gmap.spawns) {
        if (s.categories.includes('boss')) continue
        const season = s.categories.some((c) => /^season/i.test(c))
        const scav = s.sides.includes('scav') && !s.sides.includes('pmc') && !s.sides.includes('all')
        const sniper = s.categories.includes('sniper')
        if (season) { if (!toggles.spawnsSeason) continue } else if (scav || sniper) { if (!toggles.spawnsScav) continue } else if (!toggles.spawnsPmc) continue
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
    if (toggles.loot) {
      for (const c of gmap.lootContainers) {
        if (lootType && c.container !== lootType) continue
        const m = L.circleMarker(pos(c.position), dot(COLORS.loot, 3, { dim: !onLevel(c.position) }))
        tip(m, data.lootContainerNames[c.container] ?? 'Контейнер')
        group.addLayer(m)
      }
    }
    if (toggles.quests || taskParam) {
      const zoneBounds: L.LatLngExpression[] = []
      const questZones: { v: TaskView; o: Objective; z: Zone }[] = []
      for (const v of views.values()) {
        if (taskParam ? v.task.id !== taskParam : (v.status === 'done' || (questScope === 'available' && v.status !== 'available'))) continue
        for (const o of v.task.objectives) for (const z of o.zones ?? []) if (z.map === gmap.id) questZones.push({ v, o, z })
      }
      // при большом числе зон подписи только по наведению — иначе каша
      const withLabels = questZones.length <= 14 || !!taskParam
      for (const { v, o, z } of questZones) {
        const dim = !onLevel(z.position)
        if (z.outline?.length) group.addLayer(L.polygon(z.outline.map(pos), { color: COLORS.quest, weight: 1, fillOpacity: dim ? 0.04 : 0.1, interactive: false }))
        const m = L.marker(pos(z.position), { icon: icon('flag', COLORS.quest, withLabels ? v.task.name : undefined, { size: 20, dim }) })
        tip(m, `<b>${v.task.name}</b><br>${o.description}`)
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
  }, [gmap, meta, floor, toggles, questScope, lootType, views, data, taskParam, keyParam, itemParam, itemSpots, openItem, gameMode])

  // ── авто-этаж: по высоте последней точки ──
  useEffect(() => {
    if (!autoFloor || !playerPos || !meta) return
    const f = floorForPosition(meta, playerPos)
    setFloor(f)
  }, [playerPos, meta, autoFloor])

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
        <div className="absolute left-3 top-3 z-[500] panel px-3 py-2 flex items-center gap-3 shadow-[0_10px_30px_rgba(0,0,0,.5)] max-w-[420px]">
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
        <aside className={`shrink-0 h-full overflow-y-auto border-l border-line bg-bg-1 flex flex-col gap-4 p-3 ${overlay ? 'w-[220px]' : 'w-[280px]'}`}>
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
            <div className="mt-1.5 flex flex-col gap-0.5">
              {TOGGLE_LABELS.map(({ key, label, color }) => (
                <label key={key} className="flex items-center gap-2 h-7 px-1.5 rounded hover:bg-bg-2 cursor-pointer text-[13px] select-none">
                  <input type="checkbox" checked={toggles[key]} onChange={(e) => setToggles({ ...toggles, [key]: e.target.checked })} className="accent-brass" />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className={toggles[key] ? 'text-ink' : 'text-ink-3'}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <PositionPanel
            cardinalRotation={gmap?.coordinateToCardinalRotation ?? 0}
            floorName={floor >= 0 && meta ? floorName(meta.layers[floor].name) : null}
          />
          <div className="text-[11px] text-ink-4">Правый клик по карте — своя метка, клик по метке — убрать.</div>

          <SquadPanel currentMap={gmap?.normalizedName ?? ''} mapNames={Object.fromEntries(Object.values(data.maps).map((m) => [m.normalizedName, m.name]))} />

          {toggles.quests && (
            <div>
              <Eyebrow>Квесты на карте</Eyebrow>
              <div className="mt-1.5"><Segmented value={questScope} onChange={setQuestScope} options={[{ value: 'available', label: 'Доступные' }, { value: 'all', label: 'Все' }]} /></div>
            </div>
          )}

          {toggles.loot && (
            <div>
              <Eyebrow>Тип контейнера</Eyebrow>
              <select value={lootType} onChange={(e) => setLootType(e.target.value)} className="input focus:input-focus mt-1.5 w-full h-8 text-[12px]">
                <option value="">Все ({gmap?.lootContainers.length ?? 0})</option>
                {lootTypes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.n})</option>)}
              </select>
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
          {!overlay && (
            <Chip onClick={() => useUI.getState().setOverlay(true)} className="justify-center">Режим оверлея</Chip>
          )}
        </aside>
      )}
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

/** Для SVG-карт: показать нужную группу этажа, приглушить основную. */
function applySvgFloor(svgEl: SVGSVGElement, meta: MapMeta, floor: number) {
  const inner = svgEl.children[0]
  if (!inner) return
  const groups = [...inner.children].filter((c): c is SVGGElement => c.nodeName === 'g' && !!c.id)
  const baseId = meta.svgLayer
  const floorId = floor >= 0 ? meta.layers[floor]?.svgLayer : undefined
  const layerIds = new Set(meta.layers.map((l) => l.svgLayer).filter(Boolean))
  for (const g of groups) {
    const isBase = g.id === baseId || g.dataset.keepWithGroup === baseId
    const isFloorLayer = layerIds.has(g.id)
    if (isBase) {
      g.style.display = ''
      g.style.opacity = floorId ? '0.3' : ''
    } else if (isFloorLayer) {
      g.style.display = g.id === floorId ? '' : 'none'
      g.style.opacity = ''
    }
  }
}
