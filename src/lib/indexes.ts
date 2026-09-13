import type { Barter, Craft, GameData } from '@/data/types'

export interface ItemUsage {
  tasks: { task: string; count: number; fir: boolean; type: string }[]
  hideout: { station: string; level: number; count: number; fir: boolean }[]
  craftsIn: Craft[]
  craftsOut: Craft[]
  bartersIn: Barter[]
  bartersOut: Barter[]
  rewardOf: string[]
}

let cache: { data: GameData; idx: Map<string, ItemUsage> } | null = null

function usage(idx: Map<string, ItemUsage>, id: string): ItemUsage {
  let u = idx.get(id)
  if (!u) {
    u = { tasks: [], hideout: [], craftsIn: [], craftsOut: [], bartersIn: [], bartersOut: [], rewardOf: [] }
    idx.set(id, u)
  }
  return u
}

/** Обратный индекс: где используется каждый предмет. */
export function itemUsageIndex(data: GameData): Map<string, ItemUsage> {
  if (cache?.data === data) return cache.idx
  const idx = new Map<string, ItemUsage>()
  for (const t of Object.values(data.tasks)) {
    const seen = new Set<string>()
    for (const o of t.objectives) {
      if (!o.items?.length || !o.count) continue
      if (o.type !== 'giveItem' && o.type !== 'findItem' && o.type !== 'plantItem') continue
      for (const it of o.items) {
        const key = `${it}:${o.type === 'findItem' ? 'f' : 'g'}`
        if (seen.has(key)) continue
        seen.add(key)
        // «найти» и «передать» — одно и то же; оставляем одну запись
        const u = usage(idx, it)
        const prev = u.tasks.find((x) => x.task === t.id)
        if (prev) { prev.fir = prev.fir || !!o.foundInRaid; prev.count = Math.max(prev.count, o.count); continue }
        u.tasks.push({ task: t.id, count: o.count, fir: !!o.foundInRaid, type: o.type })
      }
    }
    for (const r of t.rewardItems) usage(idx, r.item).rewardOf.push(t.id)
  }
  for (const s of Object.values(data.stations)) {
    for (const l of s.levels) {
      for (const r of l.itemRequirements) usage(idx, r.item).hideout.push({ station: s.id, level: l.level, count: r.count, fir: r.foundInRaid })
    }
  }
  for (const c of data.crafts) {
    for (const r of c.requiredItems) usage(idx, r.item).craftsIn.push(c)
    for (const r of c.rewardItems) usage(idx, r.item).craftsOut.push(c)
  }
  for (const b of data.barters) {
    for (const r of b.requiredItems) usage(idx, r.item).bartersIn.push(b)
    for (const r of b.rewardItems) usage(idx, r.item).bartersOut.push(b)
  }
  cache = { data, idx }
  return idx
}
