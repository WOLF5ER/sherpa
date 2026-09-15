import type { GameData } from '@/data/types'

export interface ScavCooldown {
  /** итоговый кулдаун, секунды */
  seconds: number
  /** базовый кулдаун из настроек игры */
  base: number
  /** суммарная скидка от схрона (разведцентр), доля: 0.35 = −35% */
  hideout: number
  /** множитель Скупщика по репутации: 1 = без изменений */
  fence: number
  /** ступень репутации, с которой взят множитель */
  fenceRep: number
}

/**
 * Кулдаун дикого как считает игра: база × (1 − сумма бонусов ScavCooldownTimer построенных уровней схрона) × множитель Скупщика.
 * Бонусы разведцентра складываются по всем построенным уровням (ур. 3 = −15% и −20% вместе), репутация берётся по нижнему порогу.
 */
export function scavCooldown(data: GameData, stations: Record<string, number>, fenceRep: number): ScavCooldown {
  const base = data.scavCooldownSeconds || 1500
  let hideout = 0
  for (const st of Object.values(data.stations)) {
    const built = stations[st.id] ?? 0
    for (const lvl of st.levels) {
      if (lvl.level > built) continue
      for (const b of lvl.bonuses) if (b.type === 'ScavCooldownTimer') hideout += -b.value
    }
  }
  hideout = Math.max(0, Math.min(0.95, hideout))
  let fence = 1
  let step = 0
  for (const l of data.fenceLevels) if (fenceRep >= l.minRep) { fence = l.scavCooldown; step = l.minRep }
  return { seconds: Math.round(base * (1 - hideout) * fence), base, hideout, fence, fenceRep: step }
}

export function fmtMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m} мин ${s} с` : `${m} мин`
}
