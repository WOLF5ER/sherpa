import { get, set } from 'idb-keyval'
import type { GameMode } from './loader'
import type { Item } from './types'
import { useData } from '@/store/data'

/**
 * Точечное обновление цен по истории `json.tarkov.dev/<mode>/prices/<itemId>`.
 * Нужно для сезона: сводный файл `pvp-season/items` у tarkov.dev застрял (сканы от 29.08),
 * а история по предмету обновляется каждые ~40 минут. Тянем её только для того, что на экране.
 */

const BASE = 'https://json.tarkov.dev'
const TTL = 15 * 60 * 1000
const CONCURRENCY = 4

export interface PricePoint { price: number; priceMin: number; offerCount?: number; timestamp: number }

export interface PriceSummary {
  avg24hPrice: number | null
  lastLowPrice: number | null
  low24hPrice: number | null
  high24hPrice: number | null
  lastOfferCount: number | null
  changeLast48hPercent: number | null
  priceFresh: number
  priceScanAt: number
}

const mem = new Map<string, { at: number; summary: PriceSummary }>()
const inflight = new Map<string, Promise<PriceSummary | null>>()
const key = (mode: GameMode, id: string) => `sherpa:price:${mode}:${id}`

export function summarize(points: PricePoint[]): PriceSummary | null {
  if (!points.length) return null
  const now = Date.now()
  const last = points[points.length - 1]
  const d1 = points.filter((p) => p.timestamp > now - 86_400_000)
  const d2 = points.filter((p) => p.timestamp > now - 2 * 86_400_000 && p.timestamp <= now - 86_400_000)
  const avg = (arr: PricePoint[]) => arr.length ? Math.round(arr.reduce((s, p) => s + p.price, 0) / arr.length) : null
  const avg24 = avg(d1) ?? last.price
  const avgPrev = avg(d2)
  return {
    avg24hPrice: avg24,
    lastLowPrice: last.priceMin,
    low24hPrice: d1.length ? Math.min(...d1.map((p) => p.priceMin)) : last.priceMin,
    high24hPrice: d1.length ? Math.max(...d1.map((p) => p.price)) : last.price,
    lastOfferCount: last.offerCount ?? null,
    changeLast48hPercent: avgPrev ? Math.round(((avg24 - avgPrev) / avgPrev) * 1000) / 10 : null,
    priceFresh: last.timestamp,
    priceScanAt: last.timestamp,
  }
}

async function fetchSummary(mode: GameMode, id: string): Promise<PriceSummary | null> {
  const k = key(mode, id)
  const cached = mem.get(k) ?? (await get<{ at: number; summary: PriceSummary }>(k).catch(() => undefined))
  if (cached && Date.now() - cached.at < TTL) { mem.set(k, cached); return cached.summary }
  const res = await fetch(`${BASE}/${mode}/prices/${id}`)
  if (!res.ok) return null
  const body = await res.json() as { data?: PricePoint[] | { historicalPrices?: PricePoint[] } }
  const raw = Array.isArray(body.data) ? body.data : body.data?.historicalPrices ?? []
  const summary = summarize(raw)
  if (!summary) return null
  const entry = { at: Date.now(), summary }
  mem.set(k, entry)
  set(k, entry).catch(() => {})
  return summary
}

/** После refresh() сводка снова старая — накладываем обратно всё, что уже подтянули по истории (память, без сети). */
export function reapplyFreshPrices(): void {
  const st = useData.getState()
  if (!st.data || !st.mode || !st.data.priceAggregateStale) return
  const prefix = `sherpa:price:${st.mode}:`
  const items: Record<string, Item> = { ...st.data.items }
  let n = 0
  for (const [k, v] of mem) {
    if (!k.startsWith(prefix) || Date.now() - v.at > TTL) continue
    const id = k.slice(prefix.length)
    if (items[id] && items[id].priceFresh !== v.summary.priceFresh) { items[id] = { ...items[id], ...v.summary }; n++ }
  }
  if (n) useData.setState({ data: { ...st.data, items } })
}

/** Обновить цены перечисленных предметов в загруженном справочнике (только если сводка устарела). */
export async function freshenPrices(ids: string[], force = false): Promise<void> {
  const st = useData.getState()
  const data = st.data
  const mode = st.mode
  if (!data || !mode) return
  if (!force && !data.priceAggregateStale) return
  const todo = [...new Set(ids)].filter((id) => {
    const it = data.items[id]
    if (!it || it.types.includes('noFlea') || it.types.includes('preset')) return false
    const k = key(mode, id)
    const m = mem.get(k)
    return !(m && Date.now() - m.at < TTL && it.priceFresh === m.summary.priceFresh)
  })
  if (!todo.length) return

  const results = new Map<string, PriceSummary>()
  let cursor = 0
  const worker = async () => {
    while (cursor < todo.length) {
      const id = todo[cursor++]
      let p = inflight.get(id)
      if (!p) { p = fetchSummary(mode, id).catch(() => null); inflight.set(id, p) }
      const s = await p
      inflight.delete(id)
      if (s) results.set(id, s)
      if (results.size >= 12) flush()
    }
  }
  const flush = () => {
    if (!results.size) return
    const cur = useData.getState()
    if (!cur.data || cur.mode !== mode) { results.clear(); return }
    const items: Record<string, Item> = { ...cur.data.items }
    for (const [id, s] of results) if (items[id]) items[id] = { ...items[id], ...s }
    results.clear()
    useData.setState({ data: { ...cur.data, items } })
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker))
  flush()
}
