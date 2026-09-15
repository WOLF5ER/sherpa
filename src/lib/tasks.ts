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
  /** заперт пулом торговца: нужно выполнить N квестов торговца на этом уровне лояльности, выполнено M */
  storyLocked?: { need: number; have: number; trader: string; ll: number }
  /** заперт сюжетной главой (главы не отслеживаем — подсказка, отметить можно вручную) */
  storyGate?: string
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
  const traderIdByName = new Map(Object.values(data.traders).map((tr) => [tr.normalizedName, tr.id]))
  // счётчик пула = выполненные квесты торговца на этом уровне лояльности (см. data/storyPools.ts)
  const poolDone = new Map<string, number>()
  for (const t of Object.values(data.tasks)) {
    if (!ctx.completed[t.id] || !visibleForFaction(t, ctx.faction)) continue
    const key = poolKeyOf(t, traderIdByName)
    if (key) poolDone.set(key, (poolDone.get(key) ?? 0) + 1)
  }
  const storyLock = (t: Task): TaskView['storyLocked'] | null => {
    if (!t.storyVar) return null
    const pool = STORY_POOLS[t.storyVar.id]
    if (!pool) return null // неизвестная переменная — не мешаем
    const traderId = traderIdByName.get(pool.trader)
    const base = { need: t.storyVar.value, trader: traderId ?? pool.trader, ll: pool.ll }
    if (traderId && ctx.traderLevel(traderId) < pool.ll) return { ...base, have: -1 }
    const have = poolDone.get(`${pool.trader}:${pool.ll}`) ?? 0
    return have >= t.storyVar.value ? null : { ...base, have }
  }
  const arenaTrader = ctx.hideArena ? traderIdByName.get('ref') : undefined
  // торговец открывается наградой за квест (Знакомство → Егерь): его квесты до этого недоступны
  const traderUnlockedBy = new Map<string, string>()
  for (const t of Object.values(data.tasks)) for (const tr of t.unlocksTraders ?? []) traderUnlockedBy.set(tr, t.id)

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
    if (ok && t.storyGate) ok = false
    if (ok) {
      const unlocker = traderUnlockedBy.get(t.trader)
      if (unlocker && unlocker !== id && status(unlocker) !== 'done') ok = false
    }
    if (ok) {
      for (const r of t.taskRequirements) {
        if (!data.tasks[r.task]) continue
        const st = r.status
        if (st.includes('complete')) {
          if (status(r.task) !== 'done') { ok = false; break }
        } else if (st.includes('active')) {
          if (status(r.task) === 'locked') { ok = false; break }
        } else if (st.includes('failed')) {
          // выдаётся только после провала предшественника — провалы не отслеживаем, поэтому квест всегда «впереди»,
          // отметить его можно вручную
          ok = false; break
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
        if (r.status.includes('failed') && !r.status.includes('complete')) { missing.push(p); continue }
        if (status(r.task) !== 'done') missing.push(p)
      }
      const unlocker = traderUnlockedBy.get(t.trader)
      if (unlocker && unlocker !== t.id && status(unlocker) !== 'done' && data.tasks[unlocker]) missing.push(data.tasks[unlocker])
    }
    const sl = s === 'locked' ? storyLock(t) : null
    out.set(t.id, { task: t, status: s, missing, levelLocked: ctx.level < t.minPlayerLevel, traderLocked: s === 'locked' ? traderLocks(t, ctx) : [], storyLocked: sl ?? undefined, storyGate: s === 'locked' ? t.storyGate : undefined })
  }
  return out
}

/**
 * Ключ пула «торговец:уровень лояльности», к которому квест относится при подсчёте счётчика, либо null, если квест
 * в пулы не входит: цепочки (есть предшественники), сюжетные, престижные, Арена. Уровень — из требования к торговцу,
 * у квестов с переменной — из самой переменной (у части из них требование уровня в данных не проставлено).
 */
export function poolKeyOf(t: Task, traderIdByName: Map<string, string>): string | null {
  if (t.seasonal || t.storyGate || t.prestige || t.nameEn.includes('[PVP ZONE]')) return null
  if (t.storyVar) {
    const pool = STORY_POOLS[t.storyVar.id]
    return pool ? `${pool.trader}:${pool.ll}` : null
  }
  if (t.taskRequirements.some((r) => r.status.includes('complete') || r.status.includes('active'))) return null
  const traderName = [...traderIdByName].find(([, id]) => id === t.trader)?.[0]
  if (!traderName || !POOL_TRADERS.has(traderName)) return null
  let ll = 1
  for (const r of t.traderRequirements) if (r.requirementType === 'level' && r.trader === t.trader && r.value > ll) ll = r.value
  return `${traderName}:${ll}`
}
const POOL_TRADERS = new Set(Object.values(STORY_POOLS).map((p) => p.trader))

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
