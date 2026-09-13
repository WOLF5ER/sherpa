import type { MapMeta } from '@/data/mapMeta'
import type { XYZ } from '@/data/types'

type Rect = [[number, number], [number, number], string?]

function inRect(r: Rect, p: XYZ): boolean {
  const [[x1, z1], [x2, z2]] = r
  return p.x >= Math.min(x1, x2) && p.x <= Math.max(x1, x2) && p.z >= Math.min(z1, z2) && p.z <= Math.max(z1, z2)
}

/**
 * Авто-этаж: индекс слоя, на котором находится точка (по высоте и, если заданы, по прямоугольникам),
 * или -1 — основной уровень. Логика та же, что у tarkov.dev (markerIsOnLayer).
 */
export function floorForPosition(meta: MapMeta, p: XYZ): number {
  let fallback = -1
  meta.layers.forEach((layer, i) => {
    for (const ext of layer.extents ?? []) {
      const h = ext.height
      if (!h || p.y < h[0] || p.y >= h[1]) continue
      const rects = (ext.bounds ?? []) as Rect[]
      if (rects.length) {
        if (rects.some((r) => inRect(r, p))) { fallback = i; return }
      } else if (fallback === -1) {
        fallback = i
      }
    }
  })
  return fallback
}

/** Курс в градусах 0–360 (0 — север карты) и румб. Ориентировочно: зависит от поворота карты. */
export function heading(rotationDeg: number, cardinalRotation: number): { deg: number; label: string } {
  const deg = ((rotationDeg + cardinalRotation) % 360 + 360) % 360
  const labels = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']
  return { deg: Math.round(deg), label: labels[Math.round(deg / 45) % 8] }
}
