import type { GameData, Task } from '@/data/types'
import type { Faction } from '@/store/profile'
import { STORY_POOLS } from '@/data/storyPools'

export type TaskStatus = 'done' | 'available' | 'locked'

export interface TaskView {
  task: Task
  status: TaskStatus
  /** незакрытые предшественники */
  missing: Task[]
  levelLocked: boolean
  /** не хватает уровня лояльности: traderId → нужный уровень */
  traderLocked: { trader: string; level: number }[]
  /** заперт сюжетным пулом торговца: нужен этап N, сейчас M */
  storyLocked?: { need: number; have: number }
}

export interface TaskCtx {
  level: number
  faction: Faction
  completed: Record<string, true>
  traderLevel: (traderId: string) => number
  /** сезон: квесты Ref (Арена) в игре недоступны — прячем */
  hideArena?: boolean
}

export function visibleForFaction(task: Task, faction: Faction): boolean {
  return task.factionName === 'Any' || task.factionName === faction
}

/** Статусы всех квестов с учётом цепочек. */
export function computeTaskViews(data: GameData, ctx: TaskCtx): Map<string, TaskView> {
  const memo = new Map<string, TaskStatus>()
  const visiting = new Set<string>()
  // этап сюжетного пула = 1 + выполненных квестов этого пула
  const poolStage = new Map<string, number>()
  for (const t of Object.values(data.tasks)) if (t.storyVar && ctx.completed[t.id]) poolStage.set(t.storyVar.id, (poolStage.get(t.storyVar.id) ?? 0) + 1)
  const stageOf = (varId: string) => 1 + (poolStage.get(varId) ?? 0)
  const traderIdByName = new Map(Object.values(data.traders).map((tr) => [tr.normalizedName, tr.id]))
  const storyLock = (t: Task): { need: number; have: number } | null => {
    if (!t.storyVar) return null
    const pool = STORY_POOLS[t.storyVar.id]
    if (!pool) return null // неизвестная переменная — не мешаем
    const traderId = traderIdByName.get(pool.trader)
    if (traderId && ctx.traderLevel(traderId) < pool.ll) return { need: t.storyVar.value, have: 0 }
    const have = stageOf(t.storyVar.id)
    return have >= t.storyVar.value ? null : { need: t.storyVar.value, have }
  }
  const arenaTrader = ctx.hideArena ? traderIdByName.get('ref') : undefined

  const status = (id: string): TaskStatus => {
    const cached = memo.get(id)
    if (cached) return cached
    if (ctx.completed[id]) { memo.set(id, 'done'); return 'done' }
    const t = data.tasks[id]
    if (!t) { memo.set(id, 'locked'); return 'locked' }
    if (visiting.has(id)) return 'locked' // цикл в данных — не зависаем
    visiting.add(id)
    let ok = ctx.level >= t.minPlayerLevel
    if (ok) ok = traderLocks(t, ctx).length === 0
    if (ok) ok = storyLock(t) === null
    if (ok) {
      for (const r of t.taskRequirements) {
        if (!data.tasks[r.task]) continue
        const st = r.status
        if (st.includes('complete')) {
          if (status(r.task) !== 'done') { ok = false; break }
        } else if (st.includes('active')) {
          if (status(r.task) === 'locked') { ok = false; break }
        } else if (st.includes('failed')) {
          if (status(r.task) === 'done') { ok = false; break }
        }
      }
    }
    visiting.delete(id)
    const res: TaskStatus = ok ? 'available' : 'locked'
    memo.set(id, res)
    return res
  }

  const out = new Map<string, TaskView>()
  for (const t of Object.values(data.tasks)) {
    if (!visibleForFaction(t, ctx.faction)) continue
    if (arenaTrader && t.trader === arenaTrader) continue
    const s = status(t.id)
    const missing: Task[] = []
    if (s === 'locked') {
      for (const r of t.taskRequirements) {
        const p = data.tasks[r.task]
        if (!p) continue
        if (r.status.includes('failed')) continue
        if (status(r.task) !== 'done') missing.push(p)
      }
    }
    const sl = s === 'locked' ? storyLock(t) : null
    out.set(t.id, { task: t, status: s, missing, levelLocked: ctx.level < t.minPlayerLevel, traderLocked: s === 'locked' ? traderLocks(t, ctx) : [], storyLocked: sl ?? undefined })
  }
  return out
}

/** Требования по уровню лояльности торговца, которые пока не выполнены. Репутацию не проверяем. */
function traderLocks(t: Task, ctx: TaskCtx): { trader: string; level: number }[] {
  const out: { trader: string; level: number }[] = []
  for (const r of t.traderRequirements) {
    if (r.requirementType !== 'level') continue
    if (ctx.traderLevel(r.trader) < r.value) out.push({ trader: r.trader, level: r.value })
  }
  return out
}

/** Все предшественники (транзитивно), которые нужно закрыть, чтобы открыть квест. */
export function prerequisites(data: GameData, id: string): string[] {
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    const t = data.tasks[cur]
    if (!t) continue
    for (const r of t.taskRequirements) {
      if (r.status.includes('failed')) continue
      if (!data.tasks[r.task] || seen.has(r.task)) continue
      seen.add(r.task)
      stack.push(r.task)
    }
  }
  return [...seen]
}

/** Все квесты, которые зависят от данного (транзитивно). */
export function dependents(data: GameData, id: string): string[] {
  const rev = reverseIndex(data)
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const d of rev.get(cur) ?? []) {
      if (seen.has(d)) continue
      seen.add(d)
      stack.push(d)
    }
  }
  return [...seen]
}

let revCache: { data: GameData; idx: Map<string, string[]> } | null = null
function reverseIndex(data: GameData): Map<string, string[]> {
  if (revCache?.data === data) return revCache.idx
  const idx = new Map<string, string[]>()
  for (const t of Object.values(data.tasks)) {
    for (const r of t.taskRequirements) {
      if (r.status.includes('failed')) continue
      ;(idx.get(r.task) ?? idx.set(r.task, []).get(r.task)!).push(t.id)
    }
  }
  revCache = { data, idx }
  return idx
}

export const OBJECTIVE_ITEM_TYPES = new Set(['giveItem', 'findItem', 'plantItem', 'sellItem', 'buildWeapon'])

export function objectiveLabel(type: string): string {
  switch (type) {
    case 'giveItem': return 'Передать'
    case 'findItem': return 'Найти'
    case 'plantItem': return 'Установить'
    case 'findQuestItem': return 'Найти'
    case 'giveQuestItem': return 'Передать'
    case 'plantQuestItem': return 'Установить'
    case 'visit': return 'Посетить'
    case 'extract': return 'Выйти'
    case 'shoot': return 'Устранить'
    case 'mark': return 'Пометить'
    case 'skill': return 'Навык'
    case 'traderLevel': return 'Торговец'
    case 'traderStanding': return 'Репутация'
    case 'buildWeapon': return 'Собрать'
    case 'experience': return 'Опыт'
    case 'taskStatus': return 'Квест'
    case 'useItem': return 'Использовать'
    case 'sellItem': return 'Продать'
    default: return type
  }
}
