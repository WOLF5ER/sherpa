import type { GameData, Item } from '@/data/types'
import { ROUBLES, DOLLARS, EUROS } from '@/data/types'
import type { TaskView } from './tasks'

export interface NeedSource {
  kind: 'task' | 'hideout'
  id: string
  name: string
  /** для схрона — «Станция · ур. N» */
  detail: string
  count: number
  fir: boolean
  /** квест доступен сейчас / уровень станции — следующий */
  now: boolean
  /** альтернативы (любой из предметов) */
  alternatives?: string[]
}

export interface Need {
  item: Item
  questFir: number
  questAny: number
  hideoutFir: number
  hideoutAny: number
  total: number
  /** сколько из total нужно «прямо сейчас» (доступные квесты + следующий уровень) */
  nowTotal: number
  have: number
  sources: NeedSource[]
}

export const CURRENCY = new Set([ROUBLES, DOLLARS, EUROS])

export interface NeedsOptions {
  /** учитывать заблокированные квесты */
  includeLocked: boolean
  /** схрон: все оставшиеся уровни, иначе только следующий */
  allHideoutLevels: boolean
  kappaOnly: boolean
}

export function computeNeeds(
  data: GameData,
  views: Map<string, TaskView>,
  stations: Record<string, number>,
  have: Record<string, number>,
  opts: NeedsOptions,
): Need[] {
  const acc = new Map<string, Need>()
  const touch = (id: string): Need | null => {
    const item = data.items[id]
    if (!item) return null
    let n = acc.get(id)
    if (!n) {
      n = { item, questFir: 0, questAny: 0, hideoutFir: 0, hideoutAny: 0, total: 0, nowTotal: 0, have: have[id] ?? 0, sources: [] }
      acc.set(id, n)
    }
    return n
  }

  // ── квесты ──
  for (const v of views.values()) {
    if (v.status === 'done') continue
    if (!opts.includeLocked && v.status === 'locked') continue
    if (opts.kappaOnly && !v.task.kappaRequired) continue
    const now = v.status === 'available'
    // внутри квеста «найти» и «передать» — один и тот же предмет, не удваиваем
    const perTask = new Map<string, { count: number; fir: boolean; items: string[]; weak: boolean }>()
    for (const o of v.task.objectives) {
      if (o.optional) continue
      if (!o.items?.length || !o.count) continue
      if (o.type !== 'giveItem' && o.type !== 'findItem' && o.type !== 'plantItem') continue
      const key = o.items[0]
      const weak = o.type === 'findItem'
      const prev = perTask.get(key)
      if (prev && !prev.weak && weak) continue
      if (prev && prev.weak && !weak) { perTask.set(key, { count: o.count, fir: !!o.foundInRaid || prev.fir, items: o.items, weak: false }); continue }
      if (prev) { prev.count = Math.max(prev.count, o.count); prev.fir = prev.fir || !!o.foundInRaid; continue }
      perTask.set(key, { count: o.count, fir: !!o.foundInRaid, items: o.items, weak })
    }
    for (const [id, e] of perTask) {
      const n = touch(id)
      if (!n) continue
      if (e.fir) n.questFir += e.count
      else n.questAny += e.count
      n.total += e.count
      if (now) n.nowTotal += e.count
      n.sources.push({
        kind: 'task', id: v.task.id, name: v.task.name, detail: data.traders[v.task.trader]?.name ?? '',
        count: e.count, fir: e.fir, now, alternatives: e.items.length > 1 ? e.items : undefined,
      })
    }
  }

  // ── схрон ──
  for (const st of Object.values(data.stations)) {
    const cur = stations[st.id] ?? 0
    for (const lvl of st.levels) {
      if (lvl.level <= cur) continue
      if (!opts.allHideoutLevels && lvl.level !== cur + 1) continue
      const now = lvl.level === cur + 1
      for (const r of lvl.itemRequirements) {
        const n = touch(r.item)
        if (!n) continue
        if (r.foundInRaid) n.hideoutFir += r.count
        else n.hideoutAny += r.count
        n.total += r.count
        if (now) n.nowTotal += r.count
        n.sources.push({
          kind: 'hideout', id: lvl.id, name: st.name, detail: `уровень ${lvl.level}`, count: r.count, fir: r.foundInRaid, now,
        })
      }
    }
  }

  return [...acc.values()]
}

export function needProgress(n: Need): number {
  if (n.total <= 0) return 1
  return Math.min(1, n.have / n.total)
}
