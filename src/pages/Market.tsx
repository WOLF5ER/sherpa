import { useMemo, useState } from 'react'
import { Search, ArrowDown, ArrowUp, Star } from 'lucide-react'
import { useWatch } from '@/store/watch'
import { useGame } from '@/store/data'
import { usePriceCtx } from '@/lib/useCtx'
import { bestSell, bestTraderSell, fleaPrice, fleaSell, isFleaAllowed, perSlot, type SellOption } from '@/lib/flea'
import { search } from '@/lib/search'
import type { Item } from '@/data/types'
import { ItemCell } from '@/components/ItemCell'
import { useFreshPrices } from '@/lib/useFreshPrices'
import { freshenPrices } from '@/data/prices'
import { RefreshCw } from 'lucide-react'
import { Chip, Delta, Price, Segmented, TraderMark, Toggle, Empty } from '@/components/ui'

type SortKey = 'flea' | 'slot' | 'delta' | 'best' | 'name'
type Preset = 'all' | 'slot' | 'rising' | 'trader' | 'keys' | 'watch'

const TYPES: { id: string; label: string }[] = [
  { id: 'barter', label: 'Бартер' },
  { id: 'keys', label: 'Ключи' },
  { id: 'meds', label: 'Медицина' },
  { id: 'provisions', label: 'Еда' },
  { id: 'ammo', label: 'Патроны' },
  { id: 'gun', label: 'Оружие' },
  { id: 'mods', label: 'Модули' },
  { id: 'armor', label: 'Броня' },
  { id: 'helmet', label: 'Шлемы' },
  { id: 'rig', label: 'Разгрузки' },
  { id: 'backpack', label: 'Рюкзаки' },
  { id: 'container', label: 'Контейнеры' },
  { id: 'headphones', label: 'Наушники' },
  { id: 'grenade', label: 'Гранаты' },
  { id: 'injectors', label: 'Стимуляторы' },
]

interface Row {
  item: Item
  flea: number | null
  fleaOk: boolean
  fleaNet: number | null
  trader: SellOption | null
  best: SellOption | null
  slot: number | null
}

export function MarketPage() {
  const data = useGame()
  const ctx = usePriceCtx()
  const [q, setQ] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [preset, setPreset] = useState<Preset>('slot')
  const [sort, setSort] = useState<SortKey>('slot')
  const [desc, setDesc] = useState(true)
  const [onlyMine, setOnlyMine] = useState(true)
  const [limit, setLimit] = useState(120)
  const watch = useWatch((s) => s.items)
  const toggleWatch = useWatch((s) => s.toggle)
  const setBelow = useWatch((s) => s.setBelow)
  const setAbove = useWatch((s) => s.setAbove)
  const watchCount = Object.keys(watch).length

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const item of Object.values(data.items)) {
      if (item.types.includes('preset')) continue
      const flea = fleaPrice(item)
      const fleaOk = isFleaAllowed(item, ctx.level, ctx.fleaMinLevel)
      const fs = fleaSell(data, item, ctx)
      const trader = bestTraderSell(item)
      const best = bestSell(data, item, ctx)
      out.push({ item, flea, fleaOk, fleaNet: fs?.net ?? null, trader, best, slot: perSlot(best?.net ?? null, item) })
    }
    return out
  }, [data, ctx])

  const list = useMemo(() => {
    let l = rows
    if (type) l = l.filter((r) => r.item.types.includes(type))
    if (preset === 'keys') l = l.filter((r) => r.item.types.includes('keys'))
    if (preset === 'watch') l = l.filter((r) => watch[r.item.id])
    if (preset === 'rising') l = l.filter((r) => (r.item.changeLast48hPercent ?? 0) > 5 && r.flea && r.flea > 5000)
    if (preset === 'trader') l = l.filter((r) => r.trader && (!r.fleaNet || r.trader.net >= r.fleaNet) && r.trader.net > 10000)
    if (preset === 'slot') l = l.filter((r) => (r.best?.net ?? 0) > 0)
    if (onlyMine && preset !== 'watch') l = l.filter((r) => r.fleaOk || (r.best?.source === 'trader'))
    if (q.trim()) {
      const ids = new Set(search(q, l.map((r) => r.item), 400).map((i) => i.id))
      l = l.filter((r) => ids.has(r.item.id))
    }
    const key = (r: Row): number | string => {
      switch (sort) {
        case 'flea': return r.flea ?? -1
        case 'slot': return r.slot ?? -1
        case 'delta': return r.item.changeLast48hPercent ?? -999
        case 'best': return r.best?.net ?? -1
        case 'name': return r.item.name
      }
    }
    const dir = desc ? -1 : 1
    return [...l].sort((a, b) => {
      const ka = key(a), kb = key(b)
      if (typeof ka === 'string' && typeof kb === 'string') return ka.localeCompare(kb, 'ru') * dir
      return ((ka as number) - (kb as number)) * dir
    })
  }, [rows, type, preset, onlyMine, q, sort, desc, watch])

  // сезон: сводка устарела — слежение обновляем сами, таблицу — по кнопке (до 120 запросов)
  const stale = data.priceAggregateStale
  const watchIds = useMemo(() => Object.keys(watch), [watch])
  useFreshPrices(preset === 'watch' ? watchIds : [], 100)
  const [freshening, setFreshening] = useState(false)
  const freshenVisible = async () => {
    setFreshening(true)
    try { await freshenPrices(list.slice(0, limit).map((r) => r.item.id), true) } finally { setFreshening(false) }
  }

  const setSortKey = (k: SortKey) => {
    if (sort === k) setDesc(!desc)
    else { setSort(k); setDesc(k !== 'name') }
  }

  const Th = ({ k, children, right = true }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`py-2 px-2 ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => setSortKey(k)} className={`eyebrow inline-flex items-center gap-1 hover:text-ink ${sort === k ? 'text-brass' : ''}`}>
        {children}
        {sort === k && (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  )

  return (
    <div className="p-5 max-w-[1200px] mx-auto flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Барахолка</h1>
          <div className="mt-1 text-[13px] text-ink-3">
            Цены — средние за 24 ч. «На руки» — уже за вычетом комиссии{ctx.intelDiscount ? ' (разведцентр −30%)' : ''}; если торговец даёт больше, он и показан.
          </div>
        </div>
        <Segmented
          value={preset}
          onChange={(p) => { setPreset(p); if (p === 'slot') { setSort('slot'); setDesc(true) } if (p === 'rising') { setSort('delta'); setDesc(true) } if (p === 'trader') { setSort('best'); setDesc(true) } }}
          options={[
            { value: 'slot', label: 'За слот' },
            { value: 'rising', label: 'Растут' },
            { value: 'trader', label: 'Торговцу' },
            { value: 'keys', label: 'Ключи' },
            { value: 'watch', label: <span className="inline-flex items-center gap-1"><Star size={11} />{watchCount || ''}</span> },
            { value: 'all', label: 'Все' },
          ]}
        />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Предмет (любая раскладка)" className="input focus:input-focus pl-8 w-64" />
        </label>
        <select value={type ?? ''} onChange={(e) => setType(e.target.value || null)} className="input focus:input-focus w-40">
          <option value="">Любой тип</option>
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <Toggle value={onlyMine} onChange={setOnlyMine} label={`Доступно мне (${ctx.level} ур.)`} />
        {stale && preset !== 'watch' && (
          <button type="button" onClick={freshenVisible} disabled={freshening} className="chip hover:text-ink hover:border-ink-4 disabled:opacity-60" title={`Сводные цены tarkov.dev для этого режима от ${new Date(data.priceScanAt).toLocaleDateString('ru-RU')}. Подтянуть свежие по истории для показанных строк`}>
            <RefreshCw size={12} className={freshening ? 'animate-spin' : ''} /> {freshening ? 'обновляю…' : `Свежие цены для ${Math.min(limit, list.length)} строк`}
          </button>
        )}
        <Chip on={false} onClick={() => { setQ(''); setType(null); setPreset('all'); setOnlyMine(false) }} className="ml-auto">Сброс</Chip>
      </div>

      {preset === 'watch' && (
        <div className="text-[12px] text-ink-3">Слежение: звезда в любой таблице добавляет предмет сюда. Задай порог — строка подсветится, когда цена рынка окажется ниже (для покупки) или выше (для продажи).</div>
      )}
      {list.length === 0 ? (
        <Empty title={preset === 'watch' ? 'Пока ничего не отслеживаешь' : 'Пусто'} hint={preset === 'watch' ? 'Нажми звезду у предмета в таблице или в его карточке.' : 'Попробуй другой фильтр.'} />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-bg-1 z-10 border-b border-line">
              <tr>
                <th className="py-2 px-2 w-8" />
                <th className="py-2 px-2 w-12" />
                <Th k="name" right={false}>Предмет</Th>
                <th className="py-2 px-2 text-right"><span className="eyebrow">Слоты</span></th>
                <Th k="flea">Барахолка</Th>
                <Th k="delta">48 ч</Th>
                <th className="py-2 px-2 text-right"><span className="eyebrow">Торговец</span></th>
                <Th k="best">На руки</Th>
                <Th k="slot">За слот</Th>
                {preset === 'watch' && <th className="py-2 px-2 text-right"><span className="eyebrow">Порог</span></th>}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((r) => {
                const w = watch[r.item.id]
                const hitBelow = !!w?.below && r.flea != null && r.flea <= w.below
                const hitAbove = !!w?.above && r.flea != null && r.flea >= w.above
                return (
                <tr key={r.item.id} className={`border-b border-line/60 hover:bg-bg-2/60 ${hitBelow ? 'bg-fir/10' : hitAbove ? 'bg-brass/10' : ''}`}>
                  <td className="py-1.5 pl-2">
                    <button type="button" onClick={() => toggleWatch(r.item.id)} title={w ? 'Убрать из слежения' : 'Следить за ценой'} className={w ? 'text-brass' : 'text-ink-4 hover:text-ink-2'}>
                      <Star size={14} fill={w ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                  <td className="py-1.5 px-2"><ItemCell item={r.item} size={36} /></td>
                  <td className="py-1.5 px-2">
                    <div className="truncate max-w-[360px] text-ink">{r.item.name}</div>
                    {!r.fleaOk && <div className="text-[10px] uppercase tracking-[.1em] text-ink-4">{r.item.types.includes('noFlea') ? 'не продаётся на рынке' : ctx.fleaMinLevel === Infinity ? 'барахолка отключена' : `рынок с ${Math.max(ctx.fleaMinLevel, r.item.minLevelForFlea ?? 0)} ур.`}</div>}
                  </td>
                  <td className="py-1.5 px-2 text-right num text-ink-3">{r.item.width}×{r.item.height}</td>
                  <td className="py-1.5 px-2 text-right">
                    <Price value={r.flea} dim={!r.fleaOk} />
                    {stale && <div className={`text-[10px] num ${r.item.priceFresh ? 'text-fir/80' : 'text-ink-4'}`}>{r.item.priceFresh ? new Date(r.item.priceFresh).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : 'сводка'}</div>}
                  </td>
                  <td className="py-1.5 px-2 text-right"><Delta value={r.item.changeLast48hPercent} /></td>
                  <td className="py-1.5 px-2 text-right">
                    {r.trader && (
                      <span className="inline-flex items-center gap-1.5 justify-end">
                        <TraderMark id={r.trader.trader!} size={16} />
                        <Price value={r.trader.net} dim={r.best?.source !== 'trader'} />
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    {r.best && (
                      <span className="inline-flex items-center gap-1.5 justify-end">
                        <span className={`text-[10px] uppercase tracking-[.1em] ${r.best.source === 'flea' ? 'text-info' : 'text-ink-3'}`}>{r.best.source === 'flea' ? 'рынок' : 'торг.'}</span>
                        <Price value={r.best.net} className="text-brass-2" />
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right"><Price value={r.slot} /></td>
                  {preset === 'watch' && (
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      <label className="inline-flex items-center gap-1 text-[11px] text-ink-3">ниже
                        <input type="number" value={w?.below ?? ''} placeholder="—" onChange={(e) => setBelow(r.item.id, e.target.value ? Number(e.target.value) : null)} className={`input focus:input-focus num h-7 w-24 text-[12px] ${hitBelow ? 'border-fir' : ''}`} />
                      </label>
                      <label className="ml-2 inline-flex items-center gap-1 text-[11px] text-ink-3">выше
                        <input type="number" value={w?.above ?? ''} placeholder="—" onChange={(e) => setAbove(r.item.id, e.target.value ? Number(e.target.value) : null)} className={`input focus:input-focus num h-7 w-24 text-[12px] ${hitAbove ? 'border-brass' : ''}`} />
                      </label>
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
          {list.length > limit && (
            <button type="button" onClick={() => setLimit(limit + 120)} className="w-full py-3 text-[13px] text-ink-3 hover:text-ink hover:bg-bg-2">
              Показать ещё ({list.length - limit})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
