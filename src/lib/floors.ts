import type { MapMeta } from '@/data/mapMeta'
import type { XYZ } from '@/data/types'

type Rect = [[number, number], [number, number], string?]

function inRect(r: Rect, p: XYZ): boolean {
  const [[x1, z1], [x2, z2]] = r
  return p.x >= Math.min(x1, x2) && p.x <= Math.max(x1, x2) && p.z >= Math.min(z1, z2) && p.z <= Math.max(z1, z2)
}

function onExtent(ext: NonNullable<MapMeta['layers'][number]['extents']>[number], p: XYZ): boolean {
  const h = ext.height
  if (!h || p.y < h[0] || p.y >= h[1]) return false
  const rects = (ext.bounds ?? []) as Rect[]
  return rects.length === 0 || rects.some((r) => inRect(r, p))
}

/** Точка на слое: по высоте и, если у слоя заданы прямоугольники, — по ним (markerIsOnLayer у tarkov.dev). */
export function onLayer(layer: MapMeta['layers'][number], p: XYZ): boolean {
  return (layer.extents ?? []).some((ext) => onExtent(ext, p))
}

/** Авто-этаж: первый слой, на котором находится точка, или -1 — основной уровень (как activateMarkerLayer у tarkov.dev). */
export function floorForPosition(meta: MapMeta, p: XYZ): number {
  return meta.layers.findIndex((l) => onLayer(l, p))
}

/**
 * Показывать ли точку на выбранном этаже (иначе — приглушить). На основном уровне точка скрывается,
 * если она целиком внутри ограниченного прямоугольниками участка какого-то этажа (2-й этаж общаги на Таможне),
 * или вне heightRange карты (Улицы: всё выше 10 — этажи).
 */
export function visibleOnFloor(meta: MapMeta, floor: number, p: XYZ): boolean {
  // индекс этажа мог остаться от прошлой карты (у новой этажей меньше) — считаем его основным уровнем, а не падаем
  const layer = floor >= 0 ? meta.layers[floor] : undefined
  if (layer) return onLayer(layer, p)
  for (const l of meta.layers) for (const ext of l.extents ?? []) if (ext.bounds?.length && onExtent(ext, p)) return false
  const hr = meta.heightRange
  return !hr || (p.y >= hr[0] && p.y < hr[1])
}

/** Курс в градусах 0–360 (0 — север карты) и румб. Ориентировочно: зависит от поворота карты. */
export function heading(rotationDeg: number, cardinalRotation: number): { deg: number; label: string } {
  const deg = ((rotationDeg + cardinalRotation) % 360 + 360) % 360
  const labels = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']
  return { deg: Math.round(deg), label: labels[Math.round(deg / 45) % 8] }
}
