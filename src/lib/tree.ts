import type { GameData, Task } from '@/data/types'
import type { TaskView } from './tasks'

/** Узел дерева: квест + его позиция в цепочке. */
export interface TreeNode {
  view: TaskView
  /** глубина в цепочке (длина самого длинного пути от корня по внутренним связям) */
  depth: number
  /** внутриторговые предшественники (id) */
  prev: string[]
  /** внутриторговые наследники (id) */
  next: string[]
  /** внешние предшественники (другие торговцы) — бейдж на узле */
  external: Task[]
}

/** Цепочка-лента: связный компонент квестов одного торговца. */
export interface Chain {
  /** id квестов, сгруппированные по глубине: chains[i] — колонка */
  columns: TreeNode[][]
  /** минимальный уровень среди квестов цепочки — для сортировки лент */
  minLevel: number
  doneCount: number
  total: number
}

/**
 * Строит ленты цепочек торговца из рассчитанных статусов.
 * Связи — только внутри торговца (complete/active); внешние идут бейджами.
 * Циклы в данных разрываются: узел попадает в дерево один раз.
 */
export function buildChains(data: GameData, views: Map<string, TaskView>, traderId: string): Chain[] {
  const nodes = new Map<string, TreeNode>()
  for (const v of views.values()) {
    if (v.task.trader !== traderId) continue
    const prev: string[] = []
    const external: Task[] = []
    for (const r of v.task.taskRequirements) {
      if (!r.status.includes('complete') && !r.status.includes('active')) continue
      const p = data.tasks[r.task]
      if (!p) continue
      if (p.trader === traderId) prev.push(p.id)
      else external.push(p)
    }
    nodes.set(v.task.id, { view: v, depth: 0, prev, next: [], external })
  }
  for (const n of nodes.values()) for (const p of n.prev) nodes.get(p)?.next.push(n.view.task.id)

  // глубина — самый длинный путь от корня; при цикле — глубина 0 (узел не прячем)
  const memo = new Map<string, number>()
  const visiting = new Set<string>()
  const depth = (id: string): number => {
    const cached = memo.get(id)
    if (cached != null) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    const n = nodes.get(id)!
    const d = n.prev.length ? Math.max(...n.prev.map(depth)) + 1 : 0
    visiting.delete(id)
    memo.set(id, d)
    return d
  }
  for (const id of nodes.keys()) nodes.get(id)!.depth = depth(id)

  // связные компоненты по внутренним связям (без учёта направления)
  const comp = new Map<string, number>()
  let compCount = 0
  for (const id of nodes.keys()) {
    if (comp.has(id)) continue
    const stack = [id]
    comp.set(id, compCount)
    while (stack.length) {
      const cur = stack.pop()!
      const n = nodes.get(cur)!
      for (const nb of [...n.prev, ...n.next]) {
        if (!comp.has(nb)) { comp.set(nb, compCount); stack.push(nb) }
      }
    }
    compCount++
  }

  const byComp = new Map<number, TreeNode[]>()
  for (const [id, ci] of comp) {
    const n = nodes.get(id)!
    ;(byComp.get(ci) ?? byComp.set(ci, []).get(ci)!).push(n)
  }

  const chains: Chain[] = []
  const singles: TreeNode[] = []
  for (const group of byComp.values()) {
    // одиночные квесты (без внутренних связей) собираем в отдельную ленту в конце
    if (group.length === 1 && group[0].prev.length === 0 && group[0].next.length === 0) { singles.push(group[0]); continue }
    const maxDepth = Math.max(...group.map((n) => n.depth))
    const columns: TreeNode[][] = Array.from({ length: maxDepth + 1 }, () => [])
    for (const n of group) columns[n.depth].push(n)
    for (const col of columns) col.sort((a, b) => a.view.task.minPlayerLevel - b.view.task.minPlayerLevel || a.view.task.name.localeCompare(b.view.task.name, 'ru'))
    chains.push({
      columns,
      minLevel: Math.min(...group.map((n) => n.view.task.minPlayerLevel)),
      doneCount: group.filter((n) => n.view.status === 'done').length,
      total: group.length,
    })
  }
  chains.sort((a, b) => a.minLevel - b.minLevel)

  if (singles.length) {
    singles.sort((a, b) => a.view.task.minPlayerLevel - b.view.task.minPlayerLevel || a.view.task.name.localeCompare(b.view.task.name, 'ru'))
    // одиночные — одной «колонкой» без стрелок, сеткой
    chains.push({
      columns: [singles],
      minLevel: Math.min(...singles.map((n) => n.view.task.minPlayerLevel)),
      doneCount: singles.filter((n) => n.view.status === 'done').length,
      total: singles.length,
    })
  }
  return chains
}
