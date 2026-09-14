import { useMemo } from 'react'
import { useProfile } from '@/store/profile'
import { useGame } from '@/store/data'
import type { PriceContext } from './flea'
import { computeTaskViews, type TaskView } from './tasks'

const INTEL = 'intelligence-center'

/** Уровень торговца по уровню игрока (репутацию не учитываем) либо ручное значение. */
export function deriveTraderLevel(
  levels: { level: number; requiredPlayerLevel: number }[], playerLevel: number,
): number {
  let best = 1
  for (const l of levels) if (playerLevel >= l.requiredPlayerLevel && l.level > best) best = l.level
  return best
}

export function usePriceCtx(): PriceContext {
  const data = useGame()
  const level = useProfile((s) => s.level)
  const stations = useProfile((s) => s.stations)
  const traderLevels = useProfile((s) => s.traderLevels)
  const fleaDisabled = useProfile((s) => s.fleaDisabled)
  return useMemo(() => {
    const intel = Object.values(data.stations).find((s) => s.normalizedName === INTEL)
    const intelDiscount = !!intel && (stations[intel.id] ?? 0) >= 3
    const cache = new Map<string, number>()
    return {
      level,
      // сезонный модификатор «неработающая барахолка» — рынок недоступен ни на каком уровне
      fleaMinLevel: fleaDisabled ? Number.POSITIVE_INFINITY : data.flea.minPlayerLevel,
      intelDiscount,
      traderLevel: (id: string) => {
        const manual = traderLevels[id]
        if (manual) return manual
        let v = cache.get(id)
        if (v == null) {
          const t = data.traders[id]
          v = t ? deriveTraderLevel(t.levels, level) : 1
          cache.set(id, v)
        }
        return v
      },
    }
  }, [data, level, stations, traderLevels, fleaDisabled])
}

export function useTaskViews(): Map<string, TaskView> {
  const data = useGame()
  const ctx = usePriceCtx()
  const faction = useProfile((s) => s.faction)
  const completed = useProfile((s) => s.completed)
  const gameMode = useProfile((s) => s.gameMode)
  return useMemo(
    () => computeTaskViews(data, { level: ctx.level, faction, completed, traderLevel: ctx.traderLevel, hideArena: gameMode === 'pvp-season' }),
    [data, ctx, faction, completed, gameMode],
  )
}
