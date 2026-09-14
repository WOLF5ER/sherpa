import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Plus, Minus, Circle, Square, Navigation, Compass, X, Tag } from 'lucide-react'
import { useGame } from '@/store/data'
import type { XYZ } from '@/data/types'
import { useUI, type MapStyle } from '@/store/ui'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import { useLauncher } from '@/lib/pywebview'
import { findMeta, type MapMeta } from '@/data/mapMeta'
import { makeCRS, pos, boundsOf, icon, COLORS, svgBaseFor, applySvgFloor } from '@/lib/leaflet'
import { extractsOf } from '@/lib/extracts'
import { floorForPosition, visibleOnFloor, heading } from '@/lib/floors'

/**
 * Мини-карта: отдельное маленькое окно поверх игры. Карта по курсу (стрелка всегда вверх),
 * круг или квадрат, обновляется с каждым скриншотом. Настройки — в localStorage, общие с главным окном.
 */

interface MiniPrefs { zoom: number; round: boolean; rotate: boolean; labels: boolean; mapId: string | null }
const PREFS_KEY = 'sherpa:mini'
const readPrefs = (): MiniPrefs => {
  try { return { zoom: 5, round: true, rotate: true, labels: false, mapId: null, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') } }
  catch { return { zoom: 5, round: true, rotate: true, labels: false, mapId: null } }
}

export function MiniPage() {
  const data = useGame()
  const views = useTaskViews()
  const gameMode = useProfile((s) => s.gameMode)
  const playerPos = useUI((s) => s.playerPos)
  const trail = useUI((s) => s.trail)
  const marks = useUI((s) => s.marks)
  const squadMembers = useUI((s) => s.squadMembers)
  const squadMarks = useUI((s) => s.squadMarks)
  const squadName = useUI((s) => s.squad.name)
  const objectivesDone = useProfile((s) => s.objectivesDone)
  const toggleObjective = useProfile((s) => s.toggleObjective)
  /** клик по флажку: подтверждение «пункт выполнен» внизу окна */
  const [pick, setPick] = useState<{ task: string; objId: string; desc: string; approx: boolean } | null>(null)
  const launcher = useLauncher()
  const [prefs, setPrefs] = useState<MiniPrefs>(readPrefs)
  const [hover, setHover] = useState(false)
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* ignore */ } }, [prefs])
  // окно мини-карты всегда тёмное — углы вокруг круга не должны светиться
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    document.body.style.background = '#0d0f0c'
    document.body.style.overflow = 'hidden'
  }, [])

  // карта: своя в настройках мини-карты, иначе — та, что открыта в главном окне / брифинге
  const mapsWithMeta = useMemo(() => Object.values(data.maps).filter((m) => findMeta(m.normalizedName)), [data])
  const readMainUI = (raw: string | null) => { try { return (JSON.parse(raw ?? '{}').state ?? {}) as { currentMapId?: string | null; mapStyle?: MapStyle } } catch { return {} } }
  const [mainMapId, setMainMapId] = useState<string | null>(() => readMainUI(localStorage.getItem('sherpa:ui')).currentMapId ?? localStorage.getItem('sherpa:raidMap'))
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => readMainUI(localStorage.getItem('sherpa:ui')).mapStyle ?? 'scheme')
  useEffect(() => {
    // главное окно сменило карту или подложку — подхватываем через событие storage
    const on = (e: StorageEvent) => {
      if (e.key === 'sherpa:ui') { const u = readMainUI(e.newValue); setMainMapId(u.currentMapId ?? null); setMapStyle(u.mapStyle ?? 'scheme'); void useUI.persist.rehydrate() }
      if (e.key === 'sherpa:raidMap') setMainMapId(e.newValue)
      // отметили квест / сменили профиль в главном окне — свой store мини-карты перечитываем из localStorage
      if (e.key === 'sherpa:profile') void useProfile.persist.rehydrate()
    }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])
  const mapId = prefs.mapId ?? mainMapId ?? mapsWithMeta[0]?.id
  useEffect(() => { setPick(null) }, [mapId])
  const gmap = mapId ? data.maps[mapId] : undefined
  const meta = gmap ? findMeta(gmap.normalizedName) : undefined

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const staticRef = useRef<L.LayerGroup | null>(null)
  const liveRef = useRef<L.LayerGroup | null>(null)
  const floorTileRef = useRef<L.TileLayer | null>(null)
  const svgElRef = useRef<SVGSVGElement | null>(null)
  const [floor, setFloor] = useState(-1)
  const floorRef = useRef(floor)
  floorRef.current = floor

  // ── карта ──
  useEffect(() => {
    if (!containerRef.current || !gmap || !meta) return
    const maxZoom = Math.max(7, meta.maxZoom)
    const map = L.map(containerRef.current, {
      crs: makeCRS(meta), minZoom: meta.minZoom - 1, maxZoom, zoomSnap: 0.25,
      attributionControl: false, zoomControl: false, preferCanvas: true,
      dragging: !prefs.rotate, scrollWheelZoom: false, doubleClickZoom: false, keyboard: false, touchZoom: false,
      zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false,
    })
    mapRef.current = map
    // SVG-подложка — в свой pane под overlayPane: у svg в overlayPane z-index 200 и он накрывал canvas-точки (спавны, лут)
    map.createPane('base').style.zIndex = '250'
    map.createPane('floor').style.zIndex = '260' // тайлы этажа — над подложкой любого вида
    const bounds = boundsOf(meta.bounds)
    const tileSize = meta.tileSize ?? 256
    if (svgBaseFor(meta, mapStyle)) {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      svgElRef.current = svgEl
      L.svgOverlay(svgEl, meta.svgBounds ? boundsOf(meta.svgBounds) : bounds, { pane: 'base' }).addTo(map)
      fetch(meta.svgPath!).then((r) => r.text()).then((txt) => {
        svgEl.innerHTML = txt
        const inner = svgEl.children[0] as SVGSVGElement | undefined
        if (inner?.getAttribute('viewBox')) svgEl.setAttribute('viewBox', inner.getAttribute('viewBox')!)
        applySvgFloor(svgEl, meta, floorRef.current)
      }).catch(() => {})
    } else if (meta.tilePath) {
      L.tileLayer(meta.tilePath, { tileSize, bounds, minNativeZoom: meta.minZoom, maxNativeZoom: meta.maxZoom, maxZoom }).addTo(map)
    }
    staticRef.current = L.layerGroup().addTo(map)
    liveRef.current = L.layerGroup().addTo(map)
    map.fitBounds(bounds, { animate: false })
    const ro = new ResizeObserver(() => map.invalidateSize(false))
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; staticRef.current = null; liveRef.current = null; floorTileRef.current = null; svgElRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmap, meta, prefs.rotate, mapStyle])

  // ── этаж по высоте ──
  useEffect(() => {
    if (!playerPos || !meta) return
    setFloor(floorForPosition(meta, playerPos))
  }, [playerPos, meta])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !meta) return
    floorTileRef.current?.remove()
    floorTileRef.current = null
    const layer = floor >= 0 ? meta.layers[floor] : undefined
    if (layer?.tilePath && !(svgElRef.current && layer.svgLayer)) {
      floorTileRef.current = L.tileLayer(layer.tilePath, { pane: 'floor', tileSize: meta.tileSize ?? 256, bounds: boundsOf(meta.bounds), minNativeZoom: meta.minZoom, maxNativeZoom: meta.maxZoom, maxZoom: Math.max(7, meta.maxZoom) }).addTo(map)
    }
    if (svgElRef.current) applySvgFloor(svgElRef.current, meta, floor)
  }, [floor, meta, mapStyle])

  // ── статичные слои: выходы, транзиты, зоны доступных квестов, метки ──
  useEffect(() => {
    const group = staticRef.current
    if (!group || !gmap || !meta) return
    group.clearLayers()
    // не на текущем этаже — приглушаем, как на большой карте
    const dim = (p: XYZ) => !visibleOnFloor(meta, floor, p)
    for (const x of extractsOf(data, gmap, gameMode)) {
      if (!x.extract || x.faction === 'scav') continue
      const color = x.faction === 'pmc' ? COLORS.pmc : x.faction === 'shared' ? COLORS.shared : COLORS.btr
      group.addLayer(L.marker(pos(x.extract.position), { icon: icon('exit', color, prefs.labels ? x.label : undefined, { size: 18, dim: dim(x.extract.position) }) }))
    }
    for (const t of gmap.transits) group.addLayer(L.marker(pos(t.position), { icon: icon('transit', COLORS.transit, undefined, { size: 16, dim: dim(t.position) }) }))
    for (const v of views.values()) {
      if (v.status !== 'available') continue
      for (const o of v.task.objectives) for (const z of o.zones ?? []) {
        if (z.map !== gmap.id || objectivesDone[o.id]) continue
        const d = dim(z.position)
        const qc = v.task.seasonal ? COLORS.season : COLORS.quest
        if (z.outline?.length) group.addLayer(L.polygon(z.outline.map(pos), { color: qc, weight: 1, fillOpacity: d ? 0.04 : 0.12, opacity: d ? 0.3 : 1, interactive: false }))
        const fm = L.marker(pos(z.position), { icon: icon('flag', qc, prefs.labels ? v.task.name : undefined, { size: 16, dim: d }), zIndexOffset: 500 })
        fm.on('click', (e) => { L.DomEvent.stopPropagation(e); setPick({ task: v.task.name, objId: o.id, desc: o.description, approx: !!o.approx }) })
        group.addLayer(fm)
      }
    }
    for (const mk of marks[gmap.id] ?? []) group.addLayer(L.marker([mk.z, mk.x], { icon: icon('flag', '#e06ba0', prefs.labels ? mk.name : undefined, { size: 16 }) }))
    for (const mk of Object.values(squadMarks)) if (mk.map === gmap.normalizedName) group.addLayer(L.marker([mk.z, mk.x], { icon: icon('flag', '#5fd0d0', prefs.labels ? `${mk.label} · ${mk.by}` : undefined, { size: 16 }) }))
  }, [gmap, meta, data, views, gameMode, marks, squadMarks, prefs.labels, objectivesDone, floor])

  // ── живое: я, след, друзья; центрирование и поворот ──
  const hd = playerPos && meta ? mapHeading(meta, playerPos.rotation) : 0
  useEffect(() => {
    const map = mapRef.current
    const group = liveRef.current
    if (!map || !group || !gmap || !meta) return
    group.clearLayers()
    if (trail.length > 1) group.addLayer(L.polyline(trail.map(pos), { color: '#f0c46a', weight: 2, opacity: 0.6, dashArray: '2 5', interactive: false }))
    for (const [name, m] of Object.entries(squadMembers)) {
      if (name === squadName || !m.pos || m.map !== gmap.normalizedName) continue
      const deg = mapHeading(meta, m.pos.rotation)
      group.addLayer(L.marker(pos(m.pos), { icon: arrowIcon('#5fd0d0', deg, 20, prefs.labels ? name : undefined), zIndexOffset: 1500 }))
    }
    if (playerPos) {
      group.addLayer(L.marker(pos(playerPos), { icon: arrowIcon('#f0c46a', hd, 26), zIndexOffset: 2000 }))
      map.setView(pos(playerPos), prefs.zoom, { animate: false })
    } else {
      map.setZoom(prefs.zoom, { animate: false })
    }
  }, [playerPos, trail, squadMembers, squadName, gmap, meta, prefs.zoom, hd, prefs.labels])

  const set = (p: Partial<MiniPrefs>) => setPrefs((s) => ({ ...s, ...p }))
  const close = () => { launcher?.close_minimap?.().catch(() => {}); if (!launcher) window.close() }
  const rotateDeg = prefs.rotate && playerPos ? -hd : 0

  return (
    <div
      className={`fixed inset-0 overflow-hidden select-none bg-[#0d0f0c] ${prefs.round ? 'rounded-full' : ''}`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    >
      {/* сам холст больше окна в √2 раза — при повороте углы не оголяются */}
      <div
        ref={containerRef}
        className="absolute"
        style={{ left: '-21%', top: '-21%', width: '142%', height: '142%', transform: `rotate(${rotateDeg}deg)`, transformOrigin: '50% 50%', transition: 'transform .35s ease-out' }}
      />
      {/* компас */}
      <div className="absolute left-1/2 top-2 -translate-x-1/2 num text-[11px] text-white/90 drop-shadow-[0_0_3px_#000] pointer-events-none">
        {playerPos ? `${heading(playerPos.rotation, gmap?.coordinateToCardinalRotation ?? 0).label} · ${meta?.layers[floor]?.name ?? gmap?.name ?? ''}` : gmap?.name ?? 'Ожидаю скриншот…'}
      </div>
      {/* курс: север */}
      {prefs.rotate && (
        <div className="absolute left-1/2 top-1/2 pointer-events-none" style={{ transform: `translate(-50%,-50%) rotate(${rotateDeg}deg)` }}>
          <div className="relative w-[70vmin] h-[70vmin]"><span className="absolute left-1/2 -top-1 -translate-x-1/2 text-[10px] font-semibold text-danger drop-shadow-[0_0_3px_#000]">N</span></div>
        </div>
      )}
      {/* клик по флажку квеста — отметить пункт прямо здесь */}
      {pick && (
        <div className="absolute inset-x-2 bottom-10 rounded-[4px] bg-black/85 border border-season/60 p-2 text-white text-[11px] leading-tight shadow-[0_4px_16px_rgba(0,0,0,.6)]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{pick.task}</div>
              <div className="text-white/75 line-clamp-2">{pick.approx ? '≈ ' : ''}{pick.desc}</div>
            </div>
            <button type="button" onClick={() => setPick(null)} className="p-0.5 text-white/60 hover:text-white" aria-label="Закрыть"><X size={12} /></button>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" onClick={() => { toggleObjective(pick.objId, true); setPick(null) }} className="chip chip-on h-6 text-[10px]">✓ Пункт выполнен</button>
            <button type="button" onClick={() => setPick(null)} className="chip h-6 text-[10px]">Отмена</button>
          </div>
        </div>
      )}
      {/* панель по наведению */}
      <div className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 p-2 transition-opacity ${hover ? 'opacity-100' : 'opacity-0'}`}>
        <Btn title="Дальше" onClick={() => set({ zoom: Math.max((meta?.minZoom ?? 1) - 1, prefs.zoom - 0.5) })}><Minus size={12} /></Btn>
        <Btn title="Ближе" onClick={() => set({ zoom: Math.min(Math.max(7, meta?.maxZoom ?? 6), prefs.zoom + 0.5) })}><Plus size={12} /></Btn>
        <Btn title={prefs.rotate ? 'Север сверху' : 'По курсу'} on={prefs.rotate} onClick={() => set({ rotate: !prefs.rotate })}>{prefs.rotate ? <Navigation size={12} /> : <Compass size={12} />}</Btn>
        <Btn title={prefs.round ? 'Квадрат' : 'Круг'} onClick={() => set({ round: !prefs.round })}>{prefs.round ? <Square size={12} /> : <Circle size={12} />}</Btn>
        <Btn title="Подписи" on={prefs.labels} onClick={() => set({ labels: !prefs.labels })}><Tag size={12} /></Btn>
        <select
          value={prefs.mapId ?? ''}
          onChange={(e) => set({ mapId: e.target.value || null })}
          title="Карта"
          className="h-6 max-w-[110px] rounded-[3px] bg-black/60 border border-white/20 text-white text-[11px] px-1"
        >
          <option value="">как в главном окне</option>
          {mapsWithMeta.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Btn title="Закрыть (F8)" onClick={close}><X size={12} /></Btn>
      </div>
    </div>
  )
}

function Btn({ children, title, onClick, on = false }: { children: React.ReactNode; title: string; onClick: () => void; on?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`h-6 w-6 grid place-items-center rounded-[3px] border text-white ${on ? 'bg-brass/60 border-brass' : 'bg-black/60 border-white/20 hover:bg-black/80'}`}>
      {children}
    </button>
  )
}

function mapHeading(meta: MapMeta, rotation: number): number {
  let rot = meta.coordinateRotation ?? 0
  if (rot === 90 || rot === 270) rot += 180
  return rotation + rot
}

function arrowIcon(color: string, deg: number, size: number, label?: string): L.DivIcon {
  const html = `<div style="width:${size}px;height:${size}px;transform:translate(${-size / 2}px,${-size / 2}px)">
    <div style="width:${size}px;height:${size}px;transform:rotate(${deg}deg);filter:drop-shadow(0 0 3px #000)"><svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="M12 2 L20 22 L12 17 L4 22 Z" fill="${color}" stroke="#0d0f0c" stroke-width="1.5" stroke-linejoin="round"/></svg></div>
    ${label ? `<span class="mk-label" style="left:${size - 4}px;top:2px;color:${color}">${label.replace(/[<>&]/g, '')}</span>` : ''}</div>`
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] })
}

