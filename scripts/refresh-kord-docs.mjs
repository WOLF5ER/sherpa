// Обновление снимка точек документов боевого пропуска с фото: public/kord-docs.json.
// Источник — карта сообщества https://kord-map-mtdv.ru/ (данные точек — Telegram-канал МетаДвиж,
// фото — CC BY-NC-SA; карты — SVG tarkov-dev / RE3MR).
// Их карты — те же SVG tarkov-dev, что рисует Sherpa: их ось x зеркальна (sx = W − x),
// дальше линейная привязка через bounds карты из src/data/mapMeta.ts (для Резерва — svgBounds).
// Высота точек берётся от ближайшего спавна tarkov.dev того же документа.
// Фото вшиты в снимок как сжатые data URL; при обновлении снимок сохраняет фото прежних точек по id.
// Запуск: npm run kord:refresh
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const BASE = 'https://kord-map-mtdv.ru/'
const OUT = fileURLToPath(new URL('../public/kord-docs.json', import.meta.url))

/** их имя карты (кириллица) → normalizedName tarkov.dev и bounds из src/data/mapMeta.ts.
 *  Ледокол пропущен: у tarkov-dev нет его SVG, а bounds в данных — копия заводской. */
const KB_MAPS = {
  'берег': { norm: 'shoreline', bounds: [504, -415, -1056, 618] },
  'завод': { norm: 'factory', bounds: [77, -64.5, -65.5, 67.4] },
  'лабиринт': { norm: 'the-labyrinth', bounds: [-52, -37, 53, 76] },
  'лаборатория': { norm: 'the-lab', bounds: [-80, -477, -287, -193] },
  'лес': { norm: 'woods', bounds: [646, -914, -761, 442] },
  'маяк': { norm: 'lighthouse', bounds: [515, -998, -545, 725] },
  'развязка': { norm: 'interchange', bounds: [598, -442, -433, 426] },
  'резерв': { norm: 'reserve', bounds: [289, -274, -303, 272] },
  'таможня': { norm: 'customs', bounds: [698, -307, -372, 237] },
  'улицы': { norm: 'streets-of-tarkov', bounds: [323, -295, -280, 532] },
  'эпицентр': { norm: 'ground-zero', bounds: [249, -124, -99, 364] },
}

/** viewBox их SVG-карт (= tarkov-dev) — для перевода их x/y в проценты bounds */
const KB_VIEWBOX = {
  'берег': [1559.5717, 1032.4935],
  'завод': [130.818, 141.232],
  'лабиринт': [4800.0, 4320.0],
  'лаборатория': [720.0, 586.0],
  'лес': [1472.7926, 1420.5995],
  'маяк': [1059.3752, 1722.9499],
  'развязка': [1127.69, 947.03],
  'резерв': [827.28742, 761.16437],
  'таможня': [1062.48, 535.17],
  'улицы': [605.32395, 831.57753],
  'эпицентр': [348.92543, 488.44792],
}

/** тип документа kord-map-mtdv → id предмета tarkov.dev */
const DOC2ID = {
  'Личные данные ЧВК': '6a317b9692cfdcddcb02a58e',
  'Финансовая документация': '6a31807f17005505b70d5827',
  'Проектная документация': '6a3181f178450ec91c0ea1aa',
  'Чертежи и тех. документация': '6a31824878450ec91c0ea1ae',
  'Тестовая документация': '6a31828557705071410ca00e',
  'Пользовательская документация': '6a3182b72fd891345e047eef',
  'Медицинская документация': '6a3182dc6cd8de21cf0a3a7d',
  'Эксплуатационная документация': '6a31830dde69ceafd805afa0',
}

const [mapsResp, old] = await Promise.all([
  fetch('https://json.tarkov.dev/pvp-season/maps').then((r) => r.json()),
  readFile(OUT, 'utf8').then(JSON.parse).catch(() => null),
])
const mapsTarkov = mapsResp.data.maps
const oldImages = new Map()
if (old) for (const s of old.spots ?? []) if (s.image) oldImages.set(s.id, s.image)

// высоты: спавны tarkov.dev по картам
const loose = new Map() // norm → [{doc, x, y, z}]
for (const m of Object.values(mapsTarkov)) {
  const list = []
  for (const l of m.lootLoose ?? []) {
    for (const i of l.items ?? []) {
      if (Object.values(DOC2ID).includes(i)) list.push({ doc: i, x: l.position.x, y: l.position.y ?? 0, z: l.position.z })
    }
  }
  loose.set(m.normalizedName, list)
}

const spots = []
for (const [ru, { norm, bounds }] of Object.entries(KB_MAPS)) {
  const [W, H] = KB_VIEWBOX[ru]
  const q = encodeURIComponent(ru)
  const data = await fetch(`${BASE}data/${q}-points.json`).then((r) => r.json())
  const [x1, z1, x2, z2] = bounds
  const lx1 = Math.min(x1, x2), lx2 = Math.max(x1, x2)
  const lz1 = Math.min(z1, z2), lz2 = Math.max(z1, z2)
  for (const p of data.points ?? []) {
    const doc = DOC2ID[p.iconType]
    if (!doc) continue
    const sx = W - p.x // их ось x зеркальна нашей
    const sy = p.y
    const gx = lx1 + sx / W * (lx2 - lx1)
    const gz = lz1 + sy / H * (lz2 - lz1)
    // высота: ближайший спавн tarkov.dev того же документа (в радиусе 30 м)
    let y = 0
    let bestD2 = Infinity
    for (const o of loose.get(norm) ?? []) {
      if (o.doc !== doc) continue
      const d2 = (gx - o.x) ** 2 + (gz - o.z) ** 2
      if (d2 < bestD2) { bestD2 = d2; y = o.y }
    }
    if (bestD2 > 900) y = 0
    spots.push({
      id: p.id, map: norm, doc,
      caption: p.details ?? '',
      floor: p.floor ?? null,
      position: { x: Math.round(gx * 10) / 10, y, z: Math.round(gz * 10) / 10 },
      image: oldImages.get(p.id) ?? '',
    })
  }
}

const out = {
  $meta: {
    generated: new Date().toISOString().slice(0, 10),
    source: BASE,
    credit: 'Точки и фото: сообщество МетаДвиж (kord-map-mtdv.ru), CC BY-NC-SA; карты tarkov-dev / RE3MR. Координаты — привязка их SVG к игровой системе Sherpa',
  },
  spots,
}
await writeFile(OUT, JSON.stringify(out), 'utf8')
const withPhoto = spots.filter((s) => s.image).length
console.log(`kord-docs.json: точек ${spots.length}, с фото ${withPhoto}`)
