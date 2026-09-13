import { useEffect } from 'react'
import { freshenPrices } from '@/data/prices'
import { useData } from '@/store/data'

/** Подтянуть свежие цены по истории для предметов на экране — работает только когда сводка режима устарела. */
export function useFreshPrices(ids: string[], limit = 80, delayMs = 0) {
  const stale = useData((s) => s.data?.priceAggregateStale ?? false)
  const keyStr = ids.slice(0, limit).join(',')
  useEffect(() => {
    if (!stale || !keyStr) return
    if (!delayMs) { void freshenPrices(keyStr.split(',')); return }
    const t = setTimeout(() => void freshenPrices(keyStr.split(',')), delayMs)
    return () => clearTimeout(t)
  }, [stale, keyStr, delayMs])
}
