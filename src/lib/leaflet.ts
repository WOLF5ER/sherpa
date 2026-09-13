import L from 'leaflet'
import type { MapMeta } from '@/data/mapMeta'
import type { XYZ } from '@/data/types'
import type { MapStyle } from '@/store/ui'

/** Система координат как у tarkov.dev: игровые X/Z → пиксели тайлов с поворотом. */
export function makeCRS(meta: MapMeta): L.CRS {
  const [scaleX, marginX, scaleYRaw, marginY] = meta.transform
  const scaleY = scaleYRaw * -1
  const rot = meta.coordinateRotation ?? 0
  const rotate = (ll: L.LatLng, deg: number): L.LatLng => {
    if (!deg || (!ll.lat && !ll.lng)) return ll
    const a = (deg * Math.PI) / 180
    const c = Math.cos(a), s = Math.sin(a)
    const x = ll.lng, y = ll.lat
    return L.latLng(x * s + y * c, x * c - y * s)
  }
  return L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(scaleX, marginX, scaleY, marginY),
    projection: L.extend({}, L.Projection.LonLat, {
      project: (ll: L.LatLng) => L.Projection.LonLat.project(rotate(ll, rot)),
      unproject: (p: L.Point) => rotate(L.Projection.LonLat.unproject(p), -rot),
    }),
  }) as L.CRS
}

export const pos = (p: XYZ): L.LatLngExpression => [p.z, p.x]

export function boundsOf(b: [[number, number], [number, number]]): L.LatLngBounds {
  return L.latLngBounds([b[0][1], b[0][0]], [b[1][1], b[1][0]])
}

export function scaledBounds(b: [[number, number], [number, number]], k: number): L.LatLngBounds {
  const cx = (b[0][0] + b[1][0]) / 2
  const cy = (b[0][1] + b[1][1]) / 2
  const w = (b[1][0] - b[0][0]) * k
  const h = (b[1][1] - b[0][1]) * k
  return L.latLngBounds([cy - h / 2, cx - w / 2], [cy + h / 2, cx + w / 2])
}

/* ── иконки (lucide, статично) ─────────────────────────────────────── */
const SVG = {
  exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  skull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
  bus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>',
  transit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m17 3 4 4-4 4"/><path d="M3 7h18"/><path d="m7 21-4-4 4-4"/><path d="M21 17H3"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  // контейнеры лута (lucide) — см. containerIcon()
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 10h8"/><path d="M8 18h8"/><path d="M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
  drawer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
  food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
  med: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v4"/><path d="M14 13h-4"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M18 6v14"/><path d="M6 6v14"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/></svg>',
  body: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/></svg>',
  jacket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
  pc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2"/><path d="M15 14h.01"/><path d="M9 6h6"/><path d="M9 10h6"/></svg>',
  weapon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/></svg>',
  safe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/><path d="m7.9 7.9 2.7 2.7"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/><path d="m13.4 10.6 2.7-2.7"/><circle cx="7.5" cy="16.5" r=".5" fill="currentColor"/><path d="m7.9 16.1 2.7-2.7"/><circle cx="16.5" cy="16.5" r=".5" fill="currentColor"/><path d="m13.4 13.4 2.7 2.7"/><circle cx="12" cy="12" r="2"/></svg>',
  bomb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="13" r="9"/><path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95"/><path d="m22 2-1.5 1.5"/></svg>',
  crate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/></svg>',
  case: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
  cache: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21.56 4.56a1.5 1.5 0 0 1 0 2.122l-.47.47a3 3 0 0 1-4.212-.03 3 3 0 0 1 0-4.243l.44-.44a1.5 1.5 0 0 1 2.121 0z"/><path d="M3 22a1 1 0 0 1-1-1v-3.586a1 1 0 0 1 .293-.707l3.355-3.355a1.205 1.205 0 0 1 1.704 0l3.296 3.296a1.205 1.205 0 0 1 0 1.704l-3.355 3.355a1 1 0 0 1-.707.293z"/><path d="m9 15 7.879-7.878"/></svg>',
  ammo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20V9l2.5-5L11 9v11z"/><path d="M13 20V9l2.5-5L18 9v11z"/><path d="M6 15h5M13 15h5"/></svg>',
}

export type IconKind = keyof typeof SVG
/** те же глифы для легенды/меню слоёв */
export const MARKER_SVG: Record<IconKind, string> = SVG

export function icon(kind: IconKind, color: string, label?: string, opts: { square?: boolean; dim?: boolean; size?: number; rawLabel?: boolean } = {}): L.DivIcon {
  const size = opts.size ?? 22
  const cls = `mk${opts.square ? ' mk-sq' : ''}${opts.dim ? ' mk-dim' : ''}${size <= 16 ? ' mk-xs' : ''}`
  const text = label ? (opts.rawLabel ? label : escape(label)) : ''
  const html = `<div class="${cls}" style="background:${color};width:${size}px;height:${size}px;transform:translate(${-size / 2}px,${-size / 2}px)">${SVG[kind]}${text ? `<span class="mk-label">${text}</span>` : ''}</div>`
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] })
}

export function dot(color: string, r = 5, opts: { dim?: boolean } = {}): L.CircleMarkerOptions {
  return { radius: r, color: '#0d0f0c', weight: 1, fillColor: color, fillOpacity: opts.dim ? 0.35 : 0.95, opacity: opts.dim ? 0.4 : 0.9 }
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

export const COLORS = {
  pmc: '#6f9bd1',
  scav: '#c9873a',
  shared: '#6fc262',
  transit: '#a98bd6',
  boss: '#d84f3c',
  key: '#d4a247',
  hazard: '#d84f3c',
  switch: '#e0c93c',
  btr: '#9aa39c',
  weapon: '#9aa39c',
  loot: '#7c8a80',
  quest: '#f0c46a',
  item: '#f0c46a',
  season: '#d65fb0',
}

/** Схема (SVG) — если выбрана и есть; иначе тайлы. Карты без тайлов всегда на SVG. */
export function svgBaseFor(meta: MapMeta, style: MapStyle): boolean {
  return !!meta.svgPath && (style === 'scheme' || !meta.tilePath)
}

/** Для SVG-карт: показать нужную группу этажа, приглушить основную; на «Основном» видны слои с show. */
export function applySvgFloor(svgEl: SVGSVGElement, meta: MapMeta, floor: number) {
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
      const shown = floorId ? g.id === floorId : meta.layers.some((l) => l.svgLayer === g.id && l.show)
      g.style.display = shown ? '' : 'none'
      g.style.opacity = ''
    }
  }
}

/** контейнер лута → глиф и цвет по normalizedName tarkov.dev; неизвестный тип — ящик */
const CONTAINER_KINDS: { test: RegExp; kind: IconKind; color: string }[] = [
  { test: /duffle-bag/, kind: 'bag', color: '#8fa3b8' },
  { test: /plastic-suitcase/, kind: 'case', color: '#8fa3b8' },
  { test: /jacket/, kind: 'jacket', color: '#8fa3b8' },
  { test: /drawer/, kind: 'drawer', color: '#a08e7a' },
  { test: /wooden-crate/, kind: 'crate', color: '#a08e7a' },
  { test: /ration/, kind: 'food', color: '#7fb26a' },
  { test: /med/, kind: 'med', color: '#d86a5e' },
  { test: /technical|toolbox/, kind: 'tool', color: '#d9995a' },
  { test: /pc-block/, kind: 'pc', color: '#d9995a' },
  { test: /weapon-box/, kind: 'weapon', color: '#b8b1a3' },
  { test: /ammo-box/, kind: 'ammo', color: '#b8b1a3' },
  { test: /grenade/, kind: 'bomb', color: '#b8b1a3' },
  { test: /safe/, kind: 'safe', color: '#d4a247' },
  { test: /cash-register/, kind: 'cash', color: '#d4a247' },
  { test: /cache|stash/, kind: 'cache', color: '#9b7d55' },
  { test: /body|dead-scav/, kind: 'body', color: '#7c8a80' },
]
export function containerIcon(normalizedName: string): { kind: IconKind; color: string } {
  return CONTAINER_KINDS.find((c) => c.test.test(normalizedName)) ?? { kind: 'box', color: COLORS.loot }
}

