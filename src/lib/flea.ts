import type { GameData, Item } from '@/data/types'
import { ROUBLES, DOLLARS, EUROS } from '@/data/types'

export interface PriceContext {
  level: number
  /** минимальный уровень для барахолки вообще (из настроек игры) */
  fleaMinLevel: number
  /** itemId разведцентра ≥3 → комиссия ×0.7 */
  intelDiscount: boolean
  /** уровень торговца: traderId → 1..4 */
  traderLevel: (traderId: string) => number
}

export function isFleaAllowed(item: Item, level: number, fleaMinLevel = 15): boolean {
  if (item.types.includes('noFlea')) return false
  if (item.types.includes('preset')) return false
  if (item.id === ROUBLES || item.id === DOLLARS || item.id === EUROS) return false
  return level >= Math.max(fleaMinLevel, item.minLevelForFlea ?? 0)
}

/** Цена барахолки для расчётов: средняя за 24ч, иначе последняя минимальная. */
/**
 * Цена барахолки для расчётов и таблиц: минимальное предложение на последнем скане — то, что игрок видит
 * в игре прямо сейчас. Средняя за 24 ч отстаёт на сезонном рынке на часы и выглядит «неактуальной».
 * Если последний скан старше суток (предмет редко выставляют) — берём среднюю.
 */
export function fleaPrice(item: Item): number | null {
  const scanFresh = !item.priceScanAt || Date.now() - item.priceScanAt < 24 * 3600 * 1000
  if (scanFresh && item.lastLowPrice && item.lastLowPrice > 0) return item.lastLowPrice
  if (item.avg24hPrice && item.avg24hPrice > 0) return item.avg24hPrice
  if (item.lastLowPrice && item.lastLowPrice > 0) return item.lastLowPrice
  return null
}

/**
 * Комиссия барахолки (формула из вики):
 * VO — базовая цена, VR — цена продажи, Ti/Tr — ставки из настроек игры.
 */
export function fleaFee(data: GameData, item: Item, sellPrice: number, count = 1, intelDiscount = false): number {
  const VO = Math.max(1, item.basePrice * count)
  const VR = Math.max(1, sellPrice)
  const Ti = data.flea.sellOfferFeeRate
  const Tr = data.flea.sellRequirementFeeRate
  let PO = Math.log10(VO / VR)
  if (VR < VO) PO = Math.pow(PO, 1.08)
  let PR = Math.log10(VR / VO)
  if (VR >= VO) PR = Math.pow(PR, 1.08)
  const Q = 1
  let fee = VO * Ti * Math.pow(4, PO) * Q + VR * Tr * Math.pow(4, PR) * Q
  if (intelDiscount) fee *= 0.7
  return Math.round(fee)
}

export interface SellOption {
  source: 'flea' | 'trader'
  trader?: string
  /** что получишь на руки */
  net: number
  /** цена до комиссии (для барахолки) */
  gross: number
  fee: number
}

export function bestTraderSell(item: Item): SellOption | null {
  let best: SellOption | null = null
  for (const p of item.sellToTrader) {
    if (!best || p.priceRUB > best.net) best = { source: 'trader', trader: p.trader, net: p.priceRUB, gross: p.priceRUB, fee: 0 }
  }
  return best
}

export function fleaSell(data: GameData, item: Item, ctx: PriceContext): SellOption | null {
  if (!isFleaAllowed(item, ctx.level, ctx.fleaMinLevel)) return null
  const gross = fleaPrice(item)
  if (!gross) return null
  const fee = fleaFee(data, item, gross, 1, ctx.intelDiscount)
  return { source: 'flea', gross, fee, net: gross - fee }
}

export function bestSell(data: GameData, item: Item, ctx: PriceContext): SellOption | null {
  const t = bestTraderSell(item)
  const f = fleaSell(data, item, ctx)
  if (t && f) return f.net > t.net ? f : t
  return f ?? t
}

export interface BuyOption {
  source: 'flea' | 'trader'
  trader?: string
  price: number
  locked?: boolean
}

/** Самый дешёвый способ достать предмет с учётом уровня игрока и торговцев. */
export function cheapestBuy(item: Item, ctx: PriceContext): BuyOption | null {
  let best: BuyOption | null = null
  for (const p of item.buyFromTrader) {
    const need = p.minTraderLevel ?? 1
    if (ctx.traderLevel(p.trader) < need) continue
    if (p.taskUnlock) continue
    if (!best || p.priceRUB < best.price) best = { source: 'trader', trader: p.trader, price: p.priceRUB }
  }
  if (isFleaAllowed(item, ctx.level, ctx.fleaMinLevel)) {
    const fp = fleaPrice(item)
    if (fp && (!best || fp < best.price)) best = { source: 'flea', price: fp }
  }
  return best
}

/** Оценка стоимости, даже если сейчас недоступно (для сравнения). */
export function anyPrice(item: Item, ctx: PriceContext): number | null {
  const b = cheapestBuy(item, ctx)
  if (b) return b.price
  const fp = fleaPrice(item)
  if (fp) return fp
  let min: number | null = null
  for (const p of item.buyFromTrader) if (min == null || p.priceRUB < min) min = p.priceRUB
  return min
}

export function perSlot(value: number | null, item: Item): number | null {
  if (value == null) return null
  return value / Math.max(1, item.width * item.height)
}
