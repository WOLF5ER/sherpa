import { useEffect } from 'react'
import { freshenPrices } from '@/data/prices'
import { useData } from '@/store/data'

/** Подтянуть свежие цены по истории для предметов на экране — работает только когда сводка режима устарела. */
export function useFreshPrices(ids: string[], limit = 80) {
  const stale = useData((s) => s.data?.priceAggregateStale ?? false)
  const keyStr = ids.slice(0, limit).join(',')
  useEffect(() => {
    if (!stale || !keyStr) return
    void freshenPrices(keyStr.split(','))
  }, [stale, keyStr])
}
