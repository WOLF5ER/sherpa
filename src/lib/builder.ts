import type { GameData, Item, Slot } from '@/data/types'
import { cheapestBuy, anyPrice, type PriceContext } from './flea'

/**
 * Оружейный конструктор.
 * Дерево: оружие → слоты → модуль → его слоты → … Статы считаются как в игре:
 * эргономика — сумма, отдача — база × (1 + Σ модификаторов).
 */

export interface BuildNode {
  slot: Slot
  item: string | null
  children: BuildNode[]
}

export interface Build {
  weapon: string
  nodes: BuildNode[]
}

export interface BuildStats {
  ergonomics: number
  recoilVertical: number
  recoilHorizontal: number
  weight: number
  /** цена модулей (без оружия) по доступным источникам */
  modsPrice: number
  modsPriceKnown: boolean
  /** сколько модулей недоступно на моём уровне */
  unavailable: number
  parts: string[]
  missingRequired: Slot[]
}

export type Objective = 'ergo' | 'recoil' | 'balanced' | 'cheap'

export function emptyNodes(data: GameData, itemId: string): BuildNode[] {
  return (data.items[itemId]?.slots ?? []).map((slot) => ({ slot, item: null, children: [] }))
}

export function newBuild(data: GameData, weaponId: string): Build {
  return { weapon: weaponId, nodes: emptyNodes(data, weaponId) }
}

/** Разложить пресет по слотам: у tarkov.dev список деталей плоский, поэтому подбираем по фильтрам слотов. */
export function buildFromPreset(data: GameData, presetId: string): Build | null {
  const preset = data.items[presetId]
  const weaponId = preset?.preset?.baseItem
  if (!preset || !weaponId || !data.items[weaponId]) return null
  const pool = preset.containsItems.map((c) => c.item).filter((id) => id !== weaponId && data.items[id])
  const used = new Set<string>()
  const fill = (nodes: BuildNode[]) => {
    for (const n of nodes) {
      const cand = pool.find((id) => !used.has(id) && n.slot.allowedItems.includes(id))
      if (!cand) continue
      used.add(cand)
      n.item = cand
      n.children = emptyNodes(data, cand)
      fill(n.children)
    }
  }
  const b = newBuild(data, weaponId)
  fill(b.nodes)
  return b
}

export function allItems(b: Build): string[] {
  const out: string[] = []
  const walk = (nodes: BuildNode[]) => { for (const n of nodes) if (n.item) { out.push(n.item); walk(n.children) } }
  walk(b.nodes)
  return out
}

export function computeStats(data: GameData, b: Build, ctx: PriceContext): BuildStats {
  const w = data.items[b.weapon]
  const parts = allItems(b)
  let ergo = w.weapon?.ergonomics ?? 0
  let recoilMod = 0
  let weight = w.weight
  let price = 0
  let known = true
  let unavailable = 0
  for (const id of parts) {
    const it = data.items[id]
    if (!it) continue
    ergo += it.mod?.ergonomics ?? 0
    recoilMod += it.mod?.recoilModifier ?? 0
    weight += it.weight
    const buy = cheapestBuy(it, ctx)
    const p = buy?.price ?? anyPrice(it, ctx)
    if (!buy) unavailable++
    if (p == null) known = false
    else price += p
  }
  const missingRequired: Slot[] = []
  const walk = (nodes: BuildNode[]) => { for (const n of nodes) { if (n.slot.required && !n.item) missingRequired.push(n.slot); if (n.item) walk(n.children) } }
  walk(b.nodes)
  return {
    ergonomics: Math.round(ergo),
    recoilVertical: Math.round((w.weapon?.recoilVertical ?? 0) * (1 + recoilMod)),
    recoilHorizontal: Math.round((w.weapon?.recoilHorizontal ?? 0) * (1 + recoilMod)),
    weight: Math.round(weight * 100) / 100,
    modsPrice: price, modsPriceKnown: known, unavailable, parts, missingRequired,
  }
}

/** Модули, которые можно поставить в слот с учётом конфликтов с уже установленными. */
export function candidates(data: GameData, b: Build, slot: Slot, exceptNode?: BuildNode): Item[] {
  const installed = allItems(b).filter((id) => id !== exceptNode?.item)
  const installedSet = new Set(installed)
  const conflictsWithInstalled = (it: Item) => {
    if (it.conflictingItems?.some((c) => installedSet.has(c))) return true
    for (const id of installed) if (data.items[id]?.conflictingItems?.includes(it.id)) return true
    return false
  }
  const out: Item[] = []
  for (const id of slot.allowedItems) {
    const it = data.items[id]
    if (!it || slot.excludedItems.includes(id)) continue
    if (conflictsWithInstalled(it)) continue
    out.push(it)
  }
  return out
}

/** Оценка модуля под цель: чем больше, тем лучше. Учитывает то, что модуль сам добавит слотами (грубо — сам модуль). */
export function scoreItem(it: Item, objective: Objective, price: number | null): number {
  const e = it.mod?.ergonomics ?? 0
  const r = it.mod?.recoilModifier ?? 0
  switch (objective) {
    case 'ergo': return e * 3 - r * 100
    case 'recoil': return -r * 300 + e * 0.5
    case 'balanced': return e * 2 - r * 200
    case 'cheap': return -(price ?? 1e9) / 1000
  }
}

/**
 * Жадная оптимизация: по каждому слоту сверху вниз берём лучший доступный модуль,
 * потом так же заполняем его слоты. Не глобальный оптимум, но в духе того, как собирают руками.
 */
export function optimize(
  data: GameData, b: Build, ctx: PriceContext,
  opts: { objective: Objective; budget: number | null; onlyAvailable: boolean; fillOptional: boolean },
): Build {
  let spent = 0
  const next: Build = { weapon: b.weapon, nodes: emptyNodes(data, b.weapon) }
  const copy = (n: BuildNode): BuildNode => ({ slot: n.slot, item: n.item, children: n.children.map(copy) })
  const fill = (nodes: BuildNode[], depth: number, prev: BuildNode[] = []) => {
    for (const n of nodes) {
      const was = prev.find((p) => p.slot.id === n.slot.id)
      // магазины и патроны в оптимизацию не входят — оставляем как было
      if (/magazine|ammo|patron/i.test(n.slot.nameId) && !n.slot.required) {
        if (was?.item) { n.item = was.item; n.children = was.children.map(copy) }
        continue
      }
      if (!n.slot.required && !opts.fillOptional) {
        if (was?.item) { n.item = was.item; n.children = was.children.map(copy) }
        continue
      }
      const cands = candidates(data, next, n.slot)
      let best: { it: Item; price: number | null; score: number } | null = null
      for (const it of cands) {
        const buy = cheapestBuy(it, ctx)
        if (opts.onlyAvailable && !buy) continue
        const price = buy?.price ?? anyPrice(it, ctx)
        if (opts.budget != null && price != null && spent + price > opts.budget) continue
        const score = scoreItem(it, opts.objective, price)
        if (!best || score > best.score) best = { it, price, score }
      }
      if (!best) continue
      // необязательный слот: ставим только если модуль реально улучшает цель
      if (!n.slot.required && opts.objective !== 'cheap' && best.score <= 0) continue
      n.item = best.it.id
      spent += best.price ?? 0
      n.children = emptyNodes(data, best.it.id)
      if (depth < 6) fill(n.children, depth + 1, was?.item === best.it.id ? was.children : [])
    }
  }
  fill(next.nodes, 0, b.nodes)
  return next
}

export function setSlot(data: GameData, b: Build, target: BuildNode, itemId: string | null): Build {
  const clone = (nodes: BuildNode[]): BuildNode[] => nodes.map((n) => {
    if (n === target) return { slot: n.slot, item: itemId, children: itemId ? emptyNodes(data, itemId) : [] }
    return { slot: n.slot, item: n.item, children: clone(n.children) }
  })
  return { weapon: b.weapon, nodes: clone(b.nodes) }
}

/** Компактная сериализация для сохранения. */
export function serialize(b: Build): string {
  const enc = (nodes: BuildNode[]): unknown[] => nodes.map((n) => n.item ? [n.slot.id, n.item, enc(n.children)] : null)
  return JSON.stringify({ w: b.weapon, n: enc(b.nodes) })
}

export function deserialize(data: GameData, s: string): Build | null {
  try {
    const j = JSON.parse(s) as { w: string; n: unknown[] }
    if (!data.items[j.w]) return null
    const dec = (itemId: string, arr: unknown[]): BuildNode[] => {
      const nodes = emptyNodes(data, itemId)
      for (const e of arr) {
        if (!Array.isArray(e)) continue
        const [slotId, id, kids] = e as [string, string, unknown[]]
        const n = nodes.find((x) => x.slot.id === slotId)
        if (!n || !data.items[id]) continue
        n.item = id
        n.children = dec(id, kids)
      }
      return nodes
    }
    return { weapon: j.w, nodes: dec(j.w, j.n) }
  } catch { return null }
}
