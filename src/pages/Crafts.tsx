import { useMemo, useState } from 'react'
import { Search, Clock } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { usePriceCtx } from '@/lib/useCtx'
import { anyPrice, bestSell, cheapestBuy, type SellOption } from '@/lib/flea'
import { search } from '@/lib/search'
import { duration } from '@/lib/format'
import type { Barter, Craft, Item } from '@/data/types'
import { ItemCell } from '@/components/ItemCell'
import { Empty, Price, Segmented, Toggle, TraderMark } from '@/components/ui'

type Tab = 'crafts' | 'barters'

interface Calc {
  cost: number
  costKnown: boolean
  revenue: number
  sell: SellOption | null
  profit: number
  perHour: number | null
  available: boolean
  product: Item
  count: number
  parts: { item: Item; count: number; price: number | null; tool: boolean; source: string }[]
}

export function CraftsPage() {
  const data = useGame()
  const ctx = usePriceCtx()
  const stations = useProfile((s) => s.stations)
  const [tab, setTab] = useState<Tab>('crafts')
  const [q, setQ] = useState('')
  const [onlyAvail, setOnlyAvail] = useState(true)
  const [station, setStation] = useState<string | null>(null)
  const [trader, setTrader] = useState<string | null>(null)

  const calcParts = (req: { item: string; count: number; tool?: boolean }[]) => {
    let cost = 0
    let known = true
    const parts = req.map((r) => {
      const item = data.items[r.item]
      const buy = item ? cheapestBuy(item, ctx) : null
      const price = buy?.price ?? (item ? anyPrice(item, ctx) : null)
      if (!r.tool) {
        if (price == null) known = false
        else cost += price * r.count
      }
      return {
        item, count: r.count, price, tool: !!r.tool,
        source: buy ? (buy.source === 'flea' ? 'рынок' : data.traders[buy.trader!]?.name ?? '') : 'недоступно',
      }
    }).filter((p) => p.item)
    return { cost, known, parts }
  }

  const crafts = useMemo(() => {
    const out: { craft: Craft; calc: Calc }[] = []
    for (const c of data.crafts) {
      const product = data.items[c.rewardItems[0]?.item]
      if (!product) continue
      const { cost, known, parts } = calcParts(c.requiredItems)
      const sell = bestSell(data, product, ctx)
      const count = c.rewardItems[0].count
      const revenue = (sell?.net ?? 0) * count
      const profit = revenue - cost
      const hours = c.duration / 3600
      const available = (stations[c.station] ?? 0) >= c.level
      out.push({ craft: c, calc: { cost, costKnown: known, revenue, sell, profit, perHour: hours > 0 ? profit / hours : null, available, product, count, parts } })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ctx, stations])

  const barters = useMemo(() => {
    const out: { barter: Barter; calc: Calc }[] = []
    for (const b of data.barters) {
      const product = data.items[b.rewardItems[0]?.item]
      if (!product) continue
      const { cost, known, parts } = calcParts(b.requiredItems)
      const sell = bestSell(data, product, ctx)
      const count = b.rewardItems[0].count
      const revenue = (sell?.net ?? 0) * count
      const available = ctx.traderLevel(b.trader) >= b.level && !b.taskUnlock
      out.push({ barter: b, calc: { cost, costKnown: known, revenue, sell, profit: revenue - cost, perHour: null, available, product, count, parts } })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ctx])

  const craftList = useMemo(() => {
    let l = crafts
    if (onlyAvail) l = l.filter((x) => x.calc.available)
    if (station) l = l.filter((x) => x.craft.station === station)
    if (q.trim()) {
      const ids = new Set(search(q, l.map((x) => x.calc.product), 300).map((i) => i.id))
      l = l.filter((x) => ids.has(x.calc.product.id))
    }
    return [...l].sort((a, b) => Number(b.calc.costKnown) - Number(a.calc.costKnown) || (b.calc.perHour ?? -1e12) - (a.calc.perHour ?? -1e12))
  }, [crafts, onlyAvail, station, q])

  const barterList = useMemo(() => {
    let l = barters
    if (onlyAvail) l = l.filter((x) => x.calc.available)
    if (trader) l = l.filter((x) => x.barter.trader === trader)
    if (q.trim()) {
      const ids = new Set(search(q, l.map((x) => x.calc.product), 300).map((i) => i.id))
      l = l.filter((x) => ids.has(x.calc.product.id))
    }
    return [...l].sort((a, b) => Number(b.calc.costKnown) - Number(a.calc.costKnown) || b.calc.profit - a.calc.profit)
  }, [barters, onlyAvail, trader, q])

  const stationList = useMemo(() => Object.values(data.stations).filter((s) => data.crafts.some((c) => c.station === s.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [data])
  const traderList = useMemo(() => Object.values(data.traders).filter((t) => data.barters.some((b) => b.trader === t.id)), [data])

  return (
    <div className="p-5 max-w-[1200px] mx-auto flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">{tab === 'crafts' ? 'Крафты' : 'Бартеры'}</h1>
          <div className="mt-1 text-[13px] text-ink-3">
            Себестоимость — по самому дешёвому источнику, доступному тебе. Выручка — лучший вариант продажи после комиссии. Инструменты не расходуются и в цену не входят.
          </div>
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'crafts', label: 'Крафты' }, { value: 'barters', label: 'Бартеры' }]} />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Что производим" className="input focus:input-focus pl-8 w-56" />
        </label>
        {tab === 'crafts' ? (
          <select value={station ?? ''} onChange={(e) => setStation(e.target.value || null)} className="input focus:input-focus w-48">
            <option value="">Любая станция</option>
            {stationList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <div className="flex gap-1">
            {traderList.map((t) => (
              <button key={t.id} type="button" title={t.name} onClick={() => setTrader(trader === t.id ? null : t.id)}
                className={`rounded-[4px] border transition-all ${trader === t.id ? 'border-brass ring-1 ring-brass/40' : trader ? 'border-transparent opacity-50 hover:opacity-100' : 'border-transparent hover:border-line-2'}`}>
                <TraderMark id={t.id} size={30} className="border-0" />
              </button>
            ))}
          </div>
        )}
        <Toggle value={onlyAvail} onChange={setOnlyAvail} label={tab === 'crafts' ? 'Только мои станции' : 'Только доступные мне'} />
      </div>

      {tab === 'crafts' ? (
        craftList.length === 0 ? (
          <Empty title="Нет крафтов" hint="Укажи уровни станций схрона в профиле или выключи фильтр «Только мои станции»." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {craftList.map(({ craft, calc }) => (
              <Row key={craft.id} calc={calc}
                head={<>
                  <img src={data.stations[craft.station]?.imageLink} alt="" className="w-5 h-5 object-contain opacity-80" />
                  <span>{data.stations[craft.station]?.name} <span className="text-ink-3">ур. {craft.level}</span></span>
                  <span className="inline-flex items-center gap-1 text-ink-3 num"><Clock size={11} />{duration(craft.duration)}</span>
                </>}
              />
            ))}
          </ul>
        )
      ) : (
        barterList.length === 0 ? (
          <Empty title="Нет бартеров" hint="Смени торговца или выключи фильтр доступности." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {barterList.map(({ barter, calc }) => (
              <Row key={barter.id} calc={calc}
                head={<>
                  <TraderMark id={barter.trader} size={20} />
                  <span>{data.traders[barter.trader]?.name} <span className="text-ink-3">ур. {barter.level}</span></span>
                  {barter.taskUnlock && <span className="text-[10px] uppercase tracking-[.1em] text-ink-4">после квеста «{data.tasks[barter.taskUnlock]?.name}»</span>}
                </>}
              />
            ))}
          </ul>
        )
      )}
    </div>
  )
}

function Row({ calc, head }: { calc: Calc; head: React.ReactNode }) {
  const data = useGame()
  const good = calc.profit > 0
  return (
    <li className={`panel px-3 py-2.5 grid gap-3 items-center grid-cols-[auto_minmax(0,1fr)_auto_auto] ${!calc.available ? 'opacity-60' : ''}`}>
      <ItemCell item={calc.product} size={44} count={calc.count} />
      <div className="min-w-0">
        <div className="display text-[16px] text-ink truncate">{calc.product.name}{calc.count > 1 && <span className="text-ink-3"> ×{calc.count}</span>}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-2 flex-wrap">{head}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {calc.parts.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1" title={`${p.item.name} ×${p.count} — ${p.tool ? 'инструмент' : p.source}`}>
              <ItemCell item={p.item} size={28} count={p.count} className={p.tool ? 'opacity-50' : ''} />
              {!p.tool && <span className={`num text-[11px] ${p.price == null ? 'text-danger' : 'text-ink-3'}`}>{p.price == null ? '?' : Math.round(p.price * p.count / 1000) + 'к'}</span>}
            </span>
          ))}
        </div>
      </div>
      <div className="text-right text-[12px] leading-5">
        <div className="text-ink-3">себестоимость <Price value={calc.cost} className="text-ink-2" />{!calc.costKnown && <span className="text-danger" title="Часть цен неизвестна"> ?</span>}</div>
        <div className="text-ink-3">
          {calc.sell ? <>{calc.sell.source === 'flea' ? 'рынок' : data.traders[calc.sell.trader!]?.name}</> : 'некому продать'} <Price value={calc.revenue} className="text-ink-2" />
        </div>
      </div>
      <div className="text-right w-32">
        {calc.costKnown ? (
          <>
            <div className={`num text-[18px] ${good ? 'text-fir' : 'text-danger'}`}>{calc.profit > 0 ? '+' : ''}{Math.round(calc.profit).toLocaleString('ru-RU')} ₽</div>
            {calc.perHour != null && <div className={`num text-[12px] ${good ? 'text-ink-2' : 'text-ink-3'}`}>{Math.round(calc.perHour).toLocaleString('ru-RU')} ₽/ч</div>}
          </>
        ) : (
          <div className="num text-[18px] text-ink-4" title="Цена части ингредиентов неизвестна">?</div>
        )}
      </div>
    </li>
  )
}
