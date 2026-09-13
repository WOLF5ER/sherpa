import { useMemo, useState } from 'react'
import { Check, Clock, Lock } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { usePriceCtx } from '@/lib/useCtx'
import { cheapestBuy, anyPrice } from '@/lib/flea'
import { duration, rub } from '@/lib/format'
import { CURRENCY } from '@/lib/needs'
import { ROUBLES } from '@/data/types'
import type { HideoutLevel, HideoutStation } from '@/data/types'
import { ItemCell } from '@/components/ItemCell'
import { Eyebrow, FirBadge, Price, Segmented, Toggle } from '@/components/ui'

type Sort = 'ready' | 'cost' | 'name'

interface Plan {
  station: HideoutStation
  level: HideoutLevel
  cur: number
  cost: number
  costKnown: boolean
  blockers: string[]
  ready: boolean
  parts: { item: string; count: number; fir: boolean; price: number | null; have: number; money: boolean }[]
}

/** Планировщик схрона: что строить следующим, сколько стоит, что блокирует. */
export function HideoutPage() {
  const data = useGame()
  const ctx = usePriceCtx()
  const stations = useProfile((s) => s.stations)
  const have = useProfile((s) => s.have)
  const setStation = useProfile((s) => s.setStation)
  const [sort, setSort] = useState<Sort>('ready')
  const [hideMaxed, setHideMaxed] = useState(true)

  const plans = useMemo<Plan[]>(() => {
    const out: Plan[] = []
    for (const st of Object.values(data.stations)) {
      const cur = stations[st.id] ?? 0
      const next = st.levels.find((l) => l.level === cur + 1)
      if (!next) continue
      let cost = 0
      let costKnown = true
      const parts = next.itemRequirements.map((r) => {
        const item = data.items[r.item]
        const money = CURRENCY.has(r.item)
        let price: number | null = null
        if (money) price = r.item === ROUBLES ? 1 : (item ? anyPrice(item, ctx) : null)
        else if (item) price = cheapestBuy(item, ctx)?.price ?? anyPrice(item, ctx)
        if (price == null) costKnown = false
        else cost += price * r.count
        return { item: r.item, count: r.count, fir: r.foundInRaid, price, have: have[r.item] ?? 0, money }
      })
      const blockers: string[] = []
      for (const req of next.stationLevelRequirements) {
        if ((stations[req.station] ?? 0) < req.level) blockers.push(`${data.stations[req.station]?.name ?? '?'} ${req.level}`)
      }
      for (const req of next.traderRequirements) {
        if (ctx.traderLevel(req.trader) < req.level) blockers.push(`${data.traders[req.trader]?.name ?? '?'} ур. ${req.level}`)
      }
      for (const req of next.skillRequirements) blockers.push(`${req.skill} ${req.level}`)
      out.push({ station: st, level: next, cur, cost, costKnown, blockers, ready: blockers.length === 0, parts })
    }
    return out
  }, [data, stations, have, ctx])

  const list = useMemo(() => {
    const l = plans
    return [...l].sort((a, b) => {
      if (sort === 'ready') return Number(b.ready) - Number(a.ready) || a.cost - b.cost
      if (sort === 'cost') return a.cost - b.cost
      return a.station.name.localeCompare(b.station.name, 'ru')
    })
  }, [plans, sort])

  const maxed = useMemo(() => Object.values(data.stations).filter((st) => (stations[st.id] ?? 0) >= Math.max(...st.levels.map((l) => l.level))), [data, stations])
  const totalCost = plans.reduce((s, p) => s + p.cost, 0)
  const readyCost = plans.filter((p) => p.ready).reduce((s, p) => s + p.cost, 0)

  return (
    <div className="p-5 max-w-[1100px] mx-auto flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Схрон</h1>
          <div className="mt-1 text-[13px] text-ink-3 num">
            следующие уровни всех станций — <span className="text-ink">{rub(totalCost)}</span> · можно строить сейчас — <span className="text-fir">{rub(readyCost)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Toggle value={hideMaxed} onChange={setHideMaxed} label="Скрыть достроенные" />
          <Segmented value={sort} onChange={setSort} options={[{ value: 'ready', label: 'Готовые' }, { value: 'cost', label: 'Дешевле' }, { value: 'name', label: 'По имени' }]} />
        </div>
      </header>
      <div className="text-[12px] text-ink-3">Стоимость — по самому дешёвому доступному тебе источнику, FIR-предметы считаются по цене рынка как ориентир. Кнопка «Построено» поднимает уровень станции в профиле.</div>

      <ul className="flex flex-col gap-2">
        {list.map((p) => (
          <li key={p.station.id} className={`panel p-3 ${!p.ready ? 'opacity-75' : ''}`}>
            <div className="flex items-center gap-3">
              <img src={p.station.imageLink} alt="" className="w-9 h-9 object-contain opacity-90" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="display text-[17px] text-ink">{p.station.name}</span>
                  <span className="num text-[13px] text-ink-3">{p.cur} → {p.level.level}</span>
                  {p.ready ? <span className="eyebrow text-fir">можно строить</span> : <span className="eyebrow inline-flex items-center gap-1"><Lock size={10} />{p.blockers.join(' · ')}</span>}
                </div>
                <div className="mt-0.5 text-[12px] text-ink-3 flex items-center gap-3 flex-wrap">
                  {p.level.constructionTime > 0 && <span className="inline-flex items-center gap-1"><Clock size={11} />{duration(p.level.constructionTime)}</span>}
                  {p.level.bonuses.slice(0, 4).map((b, i) => <span key={i}>{b.name}{typeof b.value === 'number' && b.value ? ` ${b.value > 0 && b.value < 1 ? `+${Math.round(b.value * 100)}%` : b.value}` : ''}</span>)}
                </div>
              </div>
              <div className="text-right">
                <Price value={p.cost} className="text-[16px] text-ink" />
                {!p.costKnown && <span className="text-danger" title="Цена части предметов неизвестна"> ?</span>}
              </div>
              <button type="button" onClick={() => setStation(p.station.id, p.level.level)} className="chip hover:text-fir hover:border-fir/60" title="Отметить уровень построенным">
                <Check size={12} /> Построено
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.parts.map((r) => {
                const item = data.items[r.item]
                if (!item) return null
                const done = !r.money && r.have >= r.count
                return (
                  <span key={r.item} className={`inline-flex items-center gap-1.5 pr-2 rounded-[4px] border ${done ? 'border-fir/40 bg-fir/5' : 'border-line'}`}
                    title={`${item.name} ×${r.count}${r.price != null && !r.money ? ` · ${rub(r.price * r.count)}` : ''}`}>
                    {r.money ? (
                      <span className="num text-[13px] px-2 py-1 text-ink">{rub(r.count).replace(' ₽', '')} {item.shortName === '$' || item.shortName === '€' ? item.shortName : '₽'}</span>
                    ) : (
                      <>
                        <ItemCell item={item} size={32} count={r.count} fir={r.fir} />
                        <span className="text-[12px] text-ink-2 max-w-[140px] truncate">{item.shortName}</span>
                        {r.fir && <FirBadge />}
                        <span className={`num text-[11px] ${done ? 'text-fir' : 'text-ink-3'}`}>{r.have}/{r.count}</span>
                      </>
                    )}
                  </span>
                )
              })}
            </div>
          </li>
        ))}
      </ul>

      {!hideMaxed && maxed.length > 0 && (
        <section>
          <Eyebrow>Достроено</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {maxed.map((st) => <span key={st.id} className="chip"><img src={st.imageLink} alt="" className="w-4 h-4 object-contain" />{st.name}</span>)}
          </div>
        </section>
      )}
    </div>
  )
}
