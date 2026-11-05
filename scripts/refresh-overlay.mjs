#!/usr/bin/env node
/**
 * Пересобирает `public/overlay.json` — локальный снимок поправок к данным tarkov.dev.
 *
 * Зачем: репозиторий tarkov-data-overlay стал приватным (анонимно 404), но TarkovTracker
 * отдаёт те же данные уже с применённым оверлеем: https://tarkovtracker.org/api/tarkov/tasks-core
 * Скрипт тянет их ответ и сырой json.tarkov.dev, сравнивает и записывает только различия —
 * в формате, который понимает src/data/overlay.ts (applyOverlay).
 *
 * Запуск:  node scripts/refresh-overlay.mjs [--dry]
 *   --dry  только показать, что изменится, файл не трогать
 *
 * Важно: это внутренний API TarkovTracker («not a public integration surface»), поэтому он
 * используется только при сборке снимка — один запрос на релиз, не в рантайме приложения.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'overlay.json')

const MODES = ['regular', 'pve', 'pvp-season']
const TT = (mode) => `https://tarkovtracker.org/api/tarkov/tasks-core?gameMode=${mode}&lang=en`
const TD = (mode) => `https://json.tarkov.dev/${mode}/tasks`
const UA = { 'User-Agent': 'Sherpa-overlay-refresh/1.0 (+https://github.com/WOLF5ER/sherpa)' }

const dry = process.argv.includes('--dry')

async function getJson(url, tries = 3) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      last = e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw new Error(`${url}: ${last?.message ?? 'failed'}`)
}

/** Стабильная сериализация: одинаковый объект → одинаковая строка (для сравнения). */
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

const idOf = (x) => (x && typeof x === 'object' ? x.id : x)

const sortedZones = (zones = []) =>
  zones.map((z) => ({ id: z.id, map: idOf(z.map), position: z.position, outline: z.outline, top: z.top, bottom: z.bottom }))

const reqKey = (r) => `${idOf(r.trader)}|${r.requirementType}|${r.value}`
const taskReqKey = (r) => `${idOf(r.task)}|${(r.status ?? []).join(',')}`

/** Что в TT-данных отличается от сырых — в формате оверлея. null, если отличий нет. */
function diffTask(raw, tt) {
  const patch = {}

  if ((tt.factionName ?? 'Any') !== (raw.factionName ?? 'Any')) patch.factionName = tt.factionName

  for (const key of ['minPlayerLevel', 'experience']) {
    if (typeof tt[key] === 'number' && tt[key] !== raw[key]) patch[key] = tt[key]
  }
  if (typeof tt.wikiLink === 'string' && tt.wikiLink !== raw.wikiLink) patch.wikiLink = tt.wikiLink

  const ttTr = (tt.normalizedTraderRequirements ?? []).map((r) => ({ id: r.id, requirementType: r.requirementType, compareMethod: r.compareMethod, value: r.value, trader: idOf(r.trader) }))
  const rawTr = raw.traderRequirements ?? []
  if (canon(ttTr.map(reqKey).sort()) !== canon(rawTr.map(reqKey).sort())) patch.traderRequirements = ttTr

  const ttTsk = (tt.taskRequirements ?? []).map((r) => ({ task: idOf(r.task), status: r.status ?? ['complete'] }))
  const rawTsk = raw.taskRequirements ?? []
  if (canon(ttTsk.map(taskReqKey).sort()) !== canon(rawTsk.map(taskReqKey).sort())) patch.taskRequirements = ttTsk

  // storyObjective перетаскиваем, globalVariable оставляем как в сырых (applyOverlay сам их сохраняет)
  const ttOther = (tt.otherRequirements ?? []).filter((o) => o?.type !== 'globalVariable')
  const rawOther = (raw.otherRequirements ?? []).filter((o) => o?.type !== 'globalVariable')
  if (canon(ttOther) !== canon(rawOther)) {
    patch.otherRequirements = ttOther.map((o) => ({ type: o.type, storyChapter: o.storyChapter, objective: o.objective }))
  }

  const objPatch = {}
  const ttObj = new Map((tt.objectives ?? []).map((o) => [o.id, o]))
  for (const [id, o] of ttObj) {
    const rawObj = (raw.objectives ?? []).find((x) => x.id === id)
    if (!rawObj) continue
    const p = {}
    if (o.zones?.length && canon(sortedZones(rawObj.zones)) !== canon(sortedZones(o.zones))) p.zones = sortedZones(o.zones)
    const ttMaps = (o.maps ?? []).map(idOf)
    const rawMaps = (rawObj.maps ?? []).map(idOf)
    if (ttMaps.length && canon([...ttMaps].sort()) !== canon([...rawMaps].sort())) p.maps = ttMaps
    if (typeof o.count === 'number' && o.count !== rawObj.count) p.count = o.count
    if (typeof o.foundInRaid === 'boolean' && o.foundInRaid !== rawObj.foundInRaid) p.foundInRaid = o.foundInRaid
    if (Object.keys(p).length) objPatch[id] = p
  }
  if (Object.keys(objPatch).length) patch.objectives = objPatch

  return Object.keys(patch).length ? patch : null
}

function countFields(patch) {
  const n = {}
  for (const p of Object.values(patch)) {
    for (const k of Object.keys(p)) {
      if (k === 'objectives') { n.zones = (n.zones ?? 0) + 1; continue }
      n[k] = (n[k] ?? 0) + 1
    }
  }
  return n
}

/**
 * TarkovTracker отдаёт только часть целей (сотня объектов на все квесты), поэтому зоны в его ответе
 * почти всегда пустые. Зоны из предыдущего снимка переносим как есть — иначе с карты пропадут
 * точки квестов, которых в сырых данных tarkov.dev нет.
 */
function mergeOldObjectives(shared, modes, old) {
  const oldTasks = old?.tasks ?? {}
  const oldModes = old?.modes ?? {}
  let kept = 0

  const put = (id, objectives) => {
    if (shared[id]) {
      shared[id].objectives = { ...(shared[id].objectives ?? {}), ...objectives }
      kept++
      return true
    }
    for (const m of Object.values(modes)) {
      if (m.tasks?.[id]) {
        m.tasks[id].objectives = { ...(m.tasks[id].objectives ?? {}), ...objectives }
        kept++
        return true
      }
    }
    return false
  }

  const all = { ...oldTasks }
  for (const m of Object.values(oldModes)) Object.assign(all, m.tasks ?? {})
  for (const [id, p] of Object.entries(all)) {
    if (!p?.objectives) continue
    if (put(id, p.objectives)) continue
    // квест сейчас не в списке поправок — добавляем только ради зон
    shared[id] = { objectives: p.objectives }
    kept++
  }
  return kept
}

const sortDeep = (v) => {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]))
  return v
}

async function main() {
  const perMode = {}
  let meta = null

  for (const mode of MODES) {
    const [tt, td] = await Promise.all([getJson(TT(mode)), getJson(TD(mode))])
    const ttTasks = tt.data?.tasks
    const rawTasks = td.data?.tasks
    if (!Array.isArray(ttTasks) || ttTasks.length < 400) throw new Error(`${mode}: TarkovTracker вернул ${ttTasks?.length ?? 0} задач — похоже на сбой, прерываюсь`)
    if (!rawTasks || Object.keys(rawTasks).length < 400) throw new Error(`${mode}: json.tarkov.dev вернул мало задач — прерываюсь`)
    if (!meta && tt.dataOverlay) meta = tt.dataOverlay

    const patch = {}
    const seen = new Set()
    for (const t of ttTasks) {
      const raw = rawTasks[t.id]
      if (!raw) continue
      seen.add(t.id)
      const p = diffTask(raw, t)
      if (p) patch[t.id] = p
    }
    for (const id of Object.keys(rawTasks)) if (!seen.has(id)) patch[id] = { disabled: true }

    perMode[mode] = patch
    console.log(`${mode}: задач ${ttTasks.length}, поправок ${Object.keys(patch).length}`)
  }

  // одинаковые поправки во всех режимах — в общую секцию, остальные — в modes
  const shared = {}
  const modes = {}
  const ids = new Set(MODES.flatMap((m) => Object.keys(perMode[m])))
  for (const id of ids) {
    const vals = MODES.map((m) => perMode[m][id])
    if (vals.every((v) => v && canon(v) === canon(vals[0]))) { shared[id] = vals[0]; continue }
    for (let i = 0; i < MODES.length; i++) {
      if (!vals[i]) continue
      modes[MODES[i]] ??= { tasks: {} }
      modes[MODES[i]].tasks[id] = vals[i]
    }
  }

  // зоны целей из предыдущего снимка не теряем (в ответе TarkovTracker их почти нет)
  const old = JSON.parse(await readFile(OUT, 'utf8').catch(() => '{}'))
  const keptZones = mergeOldObjectives(shared, modes, old)

  const overlay = {
    $meta: {
      version: meta?.version ?? '?',
      generated: meta?.generated ?? new Date().toISOString(),
      snapshot: new Date().toISOString().slice(0, 10),
      source: 'tarkovtracker tasks-core (overlay) vs json.tarkov.dev — scripts/refresh-overlay.mjs',
      note: 'локальный снимок на случай недоступности CDN; обновляется скриптом',
    },
    tasks: sortDeep(shared),
    modes: sortDeep(modes),
  }

  const total = Object.keys(shared).length + Object.values(modes).reduce((n, m) => n + Object.keys(m.tasks ?? {}).length, 0)
  if (total < 50) throw new Error(`получилось всего ${total} поправок — слишком мало, файл не трогаю`)

  const json = JSON.stringify(overlay, null, 1) + '\n'
  const fields = countFields(shared)
  console.log('\nобщих поправок:', Object.keys(shared).length, '| режимных:', Object.keys(modes).join(', ') || '—')
  console.log('по полям:', JSON.stringify(fields))
  console.log('зон перенесено из прошлого снимка:', keptZones)
  console.log('оверлей:', `v${overlay.$meta.version}`, 'от', overlay.$meta.generated)
  console.log('размер:', (Buffer.byteLength(json) / 1024).toFixed(1), 'КБ')

  if (dry) {
    console.log('\n--dry: файл не изменён')
    return
  }

  const prev = await readFile(OUT, 'utf8').catch(() => '')
  if (prev === json) { console.log('изменений нет — файл тот же'); return }
  await writeFile(OUT, json, 'utf8')
  console.log('записан', path.relative(ROOT, OUT))
}

main().catch((e) => {
  console.error('ОШИБКА:', e.message)
  process.exit(1)
})
