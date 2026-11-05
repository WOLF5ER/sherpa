/**
 * Фото и подписи точек спавна документов боевого пропуска — из проекта kord-map-mtdv.ru
 * (карта сообщества МетаДвиж, данные точек — Telegram-канал МетаДвиж; карты tarkov-dev / RE3MR,
 * CC BY-NC-SA). Снимок лежит в public/kord-docs.json, обновляется скриптом `npm run kord:refresh`.
 *
 * Их карты — те же SVG tarkov-dev, что рисует Sherpa, поэтому точки переводятся в игровые
 * координаты точно: их ось x зеркальна (sx = W − x), дальше линейная привязка через bounds карты
 * (для Резерва — svgBounds). Слой «Документы пропуска» рисует родные точки спавна tarkov.dev
 * (lootLoose), а к каждой точке прикрепляется ближайший спавн проекта того же типа (радиус 30 м) —
 * его подпись и фото. Спавны проекта без пары рисуются отдельными маркерами (их у tarkov.dev нет).
 */
export interface KordDocSpot {
  id: string
  map: string
  doc: string
  caption: string
  floor: string | null
  position: { x: number; y: number; z: number }
  image: string
}

export interface KordDocs {
  $meta: { generated: string; source: string; credit: string }
  spots: KordDocSpot[]
}

let cache: KordDocs | null = null

export async function fetchKordDocs(): Promise<KordDocs | null> {
  if (cache) return cache
  try {
    const res = await fetch('kord-docs.json', { cache: 'no-cache' })
    if (!res.ok) return null
    const d = (await res.json()) as KordDocs
    if (!d?.spots?.length) return null
    cache = d
    return d
  } catch {
    return null
  }
}
