import L from 'leaflet'
import type { MapMeta } from '@/data/mapMeta'
import type { XYZ } from '@/data/types'

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
}

export type IconKind = keyof typeof SVG

export function icon(kind: IconKind, color: string, label?: string, opts: { square?: boolean; dim?: boolean; size?: number; rawLabel?: boolean } = {}): L.DivIcon {
  const size = opts.size ?? 22
  const cls = `mk${opts.square ? ' mk-sq' : ''}${opts.dim ? ' mk-dim' : ''}`
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
