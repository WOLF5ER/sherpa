import { create } from 'zustand'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type { PlayerPos } from '@/lib/pywebview'

/**
 * История рейдов: след «ты здесь» по скриншотам сохраняется целиком, по рейдам.
 * Живёт в IndexedDB (сотни точек за рейд — в localStorage не влезет): индекс без точек + документ на каждый рейд.
 * Рейд режется сам: новая карта в приложении, пауза дольше GAP_MS или «Сбросить след».
 */

export interface RaidPoint { x: number; y: number; z: number; r: number; t: number }
export type Outcome = 'survived' | 'died' | 'runner'
export interface RaidSummary {
  id: string
  /** id карты tarkov.dev; '' — не знаем (карта в приложении не была выбрана) */
  mapId: string
  start: number
  end: number
  /** точек */
  n: number
  /** пройдено, м (по прямой между точками) */
  dist: number
  outcome: Outcome | null
  note: string
  /** первая и последняя точки — для «где заспавнился» и «у какого выхода закончил» без загрузки всего трека */
  first?: RaidPoint
  last?: RaidPoint
}
export interface Raid extends RaidSummary { points: RaidPoint[] }

export const OUTCOME_LABEL: Record<Outcome, string> = { survived: 'Выжил', died: 'Погиб', runner: 'Сбежал' }

const INDEX_KEY = 'sherpa:raids:index'
const raidKey = (id: string) => `sherpa:raid:${id}`
/** пауза между скриншотами, после которой начинается новый рейд */
export const GAP_MS = 20 * 60 * 1000
/** шаг длиннее — не ходьба (БТР, переход), в дистанцию не идёт */
const MAX_STEP = 300

interface RaidsState {
  loaded: boolean
  list: RaidSummary[]
  /** текущий рейд (с точками) */
  current: Raid | null
  init: () => Promise<void>
  record: (pos: PlayerPos, mapId: string | null) => void
  /** закрыть текущий рейд: следующий скриншот начнёт новый */
  endCurrent: () => void
  load: (id: string) => Promise<Raid | null>
  setOutcome: (id: string, outcome: Outcome | null) => void
  setNote: (id: string, note: string) => void
  setMap: (id: string, mapId: string) => void
  remove: (id: string) => void
  removeMany: (ids: string[]) => void
}

const summary = (r: Raid): RaidSummary => ({ id: r.id, mapId: r.mapId, start: r.start, end: r.end, n: r.n, dist: r.dist, outcome: r.outcome, note: r.note, first: r.points[0], last: r.points[r.points.length - 1] })

let saveTimer: ReturnType<typeof setTimeout> | null = null
function saveCurrentSoon(r: Raid) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveTimer = null; void idbSet(raidKey(r.id), r).catch(() => {}) }, 800)
}
function saveIndex(list: RaidSummary[]) { void idbSet(INDEX_KEY, list).catch(() => {}) }

async function patch(id: string, fn: (r: Raid) => void, get: () => RaidsState, set: (p: Partial<RaidsState>) => void) {
  const s = get()
  const cur = s.current?.id === id ? s.current : null
  const r = cur ?? (await idbGet<Raid>(raidKey(id)).catch(() => undefined))
  if (!r) return
  fn(r)
  r.n = r.points.length
  await idbSet(raidKey(id), r).catch(() => {})
  const list = get().list.map((x) => (x.id === id ? summary(r) : x))
  saveIndex(list)
  set({ list, current: cur ? { ...r } : get().current })
}

export const useRaids = create<RaidsState>()((set, get) => ({
  loaded: false,
  list: [],
  current: null,

  init: async () => {
    if (get().loaded) return
    const list = (await idbGet<RaidSummary[]>(INDEX_KEY).catch(() => undefined)) ?? []
    list.sort((a, b) => b.start - a.start)
    // приложение перезапустили посреди рейда — продолжаем его
    let current: Raid | null = null
    const last = list[0]
    if (last && Date.now() - last.end < GAP_MS) current = (await idbGet<Raid>(raidKey(last.id)).catch(() => undefined)) ?? null
    set({ loaded: true, list, current })
  },

  record: (pos, mapId) => {
    const s = get()
    if (!s.loaded) return
    const t = pos.ts
    let cur = s.current
    const fresh = !cur || t - cur.end > GAP_MS || (!!mapId && !!cur.mapId && mapId !== cur.mapId) || t < cur.start
    if (fresh) {
      cur = { id: `r${t.toString(36)}${Math.random().toString(36).slice(2, 5)}`, mapId: mapId ?? '', start: t, end: t, n: 0, dist: 0, outcome: null, note: '', points: [] }
    } else {
      cur = { ...cur!, points: cur!.points.slice() }
      if (!cur.mapId && mapId) cur.mapId = mapId
    }
    const last = cur.points[cur.points.length - 1]
    if (last && last.t === t) return
    const p: RaidPoint = { x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), z: +pos.z.toFixed(1), r: Math.round(pos.rotation), t }
    if (last) {
      const d = Math.hypot(p.x - last.x, p.z - last.z)
      if (d < MAX_STEP) cur.dist += d
    }
    cur.points.push(p)
    cur.end = t
    cur.n = cur.points.length
    const sum = summary(cur)
    const list = fresh ? [sum, ...s.list] : s.list.map((x) => (x.id === cur!.id ? sum : x))
    if (fresh || s.list.length !== list.length) saveIndex(list)
    else if (cur.n % 10 === 0) saveIndex(list) // индекс — изредка, точки — в документе
    saveCurrentSoon(cur)
    set({ current: cur, list })
  },

  endCurrent: () => {
    const s = get()
    if (!s.current) return
    saveIndex(s.list)
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    void idbSet(raidKey(s.current.id), s.current).catch(() => {})
    set({ current: null })
  },

  load: async (id) => {
    const s = get()
    if (s.current?.id === id) return s.current
    return (await idbGet<Raid>(raidKey(id)).catch(() => undefined)) ?? null
  },

  setOutcome: (id, outcome) => { void patch(id, (r) => { r.outcome = outcome }, get, set) },
  setNote: (id, note) => { void patch(id, (r) => { r.note = note }, get, set) },
  setMap: (id, mapId) => { void patch(id, (r) => { r.mapId = mapId }, get, set) },

  remove: (id) => {
    const s = get()
    const list = s.list.filter((x) => x.id !== id)
    saveIndex(list)
    void idbDel(raidKey(id)).catch(() => {})
    set({ list, current: s.current?.id === id ? null : s.current })
  },
  removeMany: (ids) => {
    const drop = new Set(ids)
    const s = get()
    const list = s.list.filter((x) => !drop.has(x.id))
    saveIndex(list)
    for (const id of ids) void idbDel(raidKey(id)).catch(() => {})
    set({ list, current: s.current && drop.has(s.current.id) ? null : s.current })
  },
}))
