import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ArrowDown, ArrowUp, MapPin, Check, Infinity as InfinityIcon } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useUI } from '@/store/ui'
import { usePriceCtx, useTaskViews } from '@/lib/useCtx'
import { cheapestBuy, fleaPrice, type BuyOption } from '@/lib/flea'
import { itemUsageIndex } from '@/lib/indexes'
import { search } from '@/lib/search'
import { useFreshPrices } from '@/lib/useFreshPrices'
import { findMeta } from '@/data/mapMeta'
import type { Item } from '@/data/types'
import type { TaskView } from '@/lib/tasks'
import { ItemCell } from '@/components/ItemCell'
import { Chip, Empty, Price, Segmented, Toggle, TraderMark } from '@/components/ui'

type Preset = 'quests' | 'all' | 'mine'
type SortKey = 'name' | 'price' | 'quests' | 'doors' | 'perUse'

interface Row {
  item: Item
  /** карта → сколько дверей/контейнеров открывает */
  maps: { id: string; name: string; normalizedName: string; doors: number }[]
  /** квесты, которым нужен ключ */
  tasks: { view: TaskView; map: string | null }[]
  /** нужен прямо сейчас: есть доступный невыполненный квест */
  now: boolean
  uses: number | null
  flea: number | null
  buy: BuyOption | null
  /** бартеры, дающие ключ: торговцы */
  barterTraders: string[]
  /** точек россыпного лута, где может лежать */
  spawns: number
  have: boolean
}

const KEYCARD_CATEGORY = '5c164d2286f774194c5e69fa'

export function KeysPage() {
  const data = useGame()
  const views = useTaskViews()
  const ctx = usePriceCtx()
  const have = useProfile((s) => s.have)
  const setHave = useProfile((s) => s.setHave)
  const openItem = useUI((s) => s.openItem)
  const [q, setQ] = useState('')
  const [preset, setPreset] = useState<Preset>('quests')
  const [mapFilter, setMapFilter] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [hideDone, setHideDone] = useState(true)
  const [sort, setSort] = useState<SortKey>('quests')
  const [desc, setDesc] = useState(true)

  const rows = useMemo((): Row[] => {
    const usage = itemUsageIndex(data)
    // двери по картам
    const doors = new Map<string, Map<string, number>>()
    const spawns = new Map<string, number>()
    for (const m of Object.values(data.maps)) {
      for (const l of m.locks) {
        if (!l.key) continue
        const byMap = doors.get(l.key) ?? doors.set(l.key, new Map()).get(l.key)!
        byMap.set(m.id, (byMap.get(m.id) ?? 0) + 1)
      }
      for (const l of m.lootLoose) for (const id of l.items) if (data.items[id]?.types.includes('keys')) spawns.set(id, (spawns.get(id) ?? 0) + 1)
    }
    // квесты
    const tasksByKey = new Map<string, { view: TaskView; map: string | null }[]>()
    for (const v of views.values()) {
      for (const nk of v.task.neededKeys) for (const k of nk.keys) {
        const list = tasksByKey.get(k) ?? tasksByKey.set(k, []).get(k)!
        if (!list.some((x) => x.view.task.id === v.task.id)) list.push({ view: v, map: nk.map })
      }
    }
    const out: Row[] = []
    for (const item of Object.values(data.items)) {
      if (!item.types.includes('keys')) continue
      const byMap = doors.get(item.id)
      const maps = [...(byMap?.entries() ?? [])]
        .map(([id, n]) => ({ id, name: data.maps[id]?.name ?? id, normalizedName: data.maps[id]?.normalizedName ?? '', doors: n }))
        .sort((a, b) => b.doors - a.doors)
      const tasks = (tasksByKey.get(item.id) ?? []).sort((a, b) => Number(b.view.status === 'available') - Number(a.view.status === 'available') || a.view.task.minPlayerLevel - b.view.task.minPlayerLevel)
      const barterTraders = [...new Set((usage.get(item.id)?.bartersOut ?? []).map((b) => b.trader))]
      out.push({
        item, maps, tasks,
        now: tasks.some((t) => t.view.status === 'available'),
        uses: item.keyUses ?? null,
        flea: fleaPrice(item),
        buy: cheapestBuy(item, ctx),
        barterTraders,
        spawns: spawns.get(item.id) ?? 0,
        have: (have[item.id] ?? 0) > 0,
      })
    }
    return out
  }, [data, views, ctx, have])

  const list = useMemo(() => {
    let l = rows
    if (preset === 'quests') l = l.filter((r) => r.tasks.some((t) => !hideDone || t.view.status !== 'done') && (!availableOnly || r.now))
    if (preset === 'mine') l = l.filter((r) => r.have)
    if (mapFilter) l = l.filter((r) => r.maps.some((m) => m.id === mapFilter) || r.tasks.some((t) => t.map === mapFilter || t.view.task.map === mapFilter))
    if (q.trim()) {
      const ids = new Set(search(q, l.map((r) => r.item), 300).map((i) => i.id))
      l = l.filter((r) => ids.has(r.item.id))
    }
    const price = (r: Row) => r.buy?.price ?? r.flea ?? 0
    const perUse = (r: Row) => (price(r) ? price(r) / (r.uses ?? 200) : 0)
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      name: (a, b) => a.item.name.localeCompare(b.item.name, 'ru'),
      price: (a, b) => price(a) - price(b),
      quests: (a, b) => Number(a.now) - Number(b.now) || a.tasks.filter((t) => t.view.status !== 'done').length - b.tasks.filter((t) => t.view.status !== 'done').length || a.tasks.length - b.tasks.length,
      doors: (a, b) => a.maps.reduce((n, m) => n + m.doors, 0) - b.maps.reduce((n, m) => n + m.doors, 0),
      perUse: (a, b) => perUse(a) - perUse(b),
    }
    return [...l].sort((a, b) => (desc ? -1 : 1) * cmp[sort](a, b) || a.item.name.localeCompare(b.item.name, 'ru'))
  }, [rows, preset, mapFilter, q, availableOnly, hideDone, sort, desc])

  useFreshPrices(list.slice(0, 120).map((r) => r.item.id), 120, 700)

  const mapOptions = useMemo(() => Object.values(data.maps).filter((m) => findMeta(m.normalizedName)).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [data])
  const setSortKey = (k: SortKey) => { if (sort === k) setDesc(!desc); else { setSort(k); setDesc(k !== 'name') } }
  const th = (k: SortKey, label: string, right = true) => (
    <th className={`py-2 px-2 ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => setSortKey(k)} className={`eyebrow inline-flex items-center gap-1 hover:text-ink ${sort === k ? 'text-brass' : ''}`}>
        {label}{sort === k && (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  )
  const questsCount = rows.filter((r) => r.tasks.some((t) => t.view.status !== 'done')).length
  const mineCount = rows.filter((r) => r.have).length

  return (
    <div className="p-5 max-w-[1300px] mx-auto flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Ключи</h1>
          <div className="mt-1 text-[13px] text-ink-3">Какие двери открывает, каким квестам нужен, почём и где может лежать. Галочка «есть» — ключ в схроне: такие в брифинге и «Предметах» считаются собранными.</div>
        </div>
        <Segmented value={preset} onChange={setPreset} options={[
          { value: 'quests', label: `Для квестов · ${questsCount}` },
          { value: 'mine', label: <span className="inline-flex items-center gap-1"><Check size={11} />{mineCount || ''}</span> },
          { value: 'all', label: `Все · ${rows.length}` },
        ]} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ключ (любая раскладка)" className="input focus:input-focus pl-8 w-64" />
        </label>
        <select value={mapFilter} onChange={(e) => setMapFilter(e.target.value)} className="input focus:input-focus w-44">
          <option value="">Любая карта</option>
          {mapOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {preset === 'quests' && <Toggle value={availableOnly} onChange={setAvailableOnly} label="Только доступные сейчас квесты" />}
        {preset === 'quests' && <Toggle value={hideDone} onChange={setHideDone} label="Скрыть выполненные" />}
        <Chip onClick={() => { setQ(''); setMapFilter(''); setPreset('all'); setAvailableOnly(false) }} className="ml-auto">Сброс</Chip>
      </div>

      {list.length === 0 ? (
        <Empty title="Пусто" hint={preset === 'mine' ? 'Отметь галочкой ключи, которые лежат в схроне.' : 'Попробуй другой фильтр.'} />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-bg-1 z-10 border-b border-line">
              <tr>
                <th className="py-2 px-2 w-8"><span className="eyebrow" title="Есть в схроне">Есть</span></th>
                <th className="py-2 px-2 w-12" />
                {th('name', 'Ключ', false)}
                {th('doors', 'Двери', false)}
                {th('quests', 'Квесты', false)}
                <th className="py-2 px-2 text-right"><span className="eyebrow" title="Сколько раз можно использовать">Исп.</span></th>
                {th('price', 'Цена')}
                {th('perUse', 'За исп.')}
                <th className="py-2 px-2 text-right"><span className="eyebrow" title="Точек россыпного лута, где ключ может лежать">Спавн</span></th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 300).map((r) => {
                const price = r.buy?.price ?? r.flea
                const perUse = price != null && r.uses ? Math.round(price / r.uses) : null
                const card = r.item.categories.includes(KEYCARD_CATEGORY)
                return (
                  <tr key={r.item.id} className={`border-b border-line/60 hover:bg-bg-2/60 ${r.have ? 'bg-fir/5' : ''}`}>
                    <td className="py-1.5 pl-3">
                      <button type="button" onClick={() => setHave(r.item.id, r.have ? 0 : 1)} title={r.have ? 'Убрать отметку «есть»' : 'Отметить: ключ есть'}
                        className={`w-4 h-4 rounded-[3px] border grid place-items-center ${r.have ? 'bg-fir/20 border-fir text-fir' : 'border-line-2 hover:border-ink-3 text-transparent'}`}>
                        <Check size={11} />
                      </button>
                    </td>
                    <td className="py-1.5 px-2"><ItemCell item={r.item} size={36} /></td>
                    <td className="py-1.5 px-2 min-w-[200px]">
                      <button type="button" onClick={() => openItem(r.item.id)} className="text-left text-ink hover:text-brass-2 truncate max-w-[300px] block">{r.item.name}</button>
                      <div className="text-[11px] text-ink-3 flex flex-wrap gap-x-2">
                        {card && <span className="text-info">ключ-карта</span>}
                        {r.now && <span className="text-brass-2">нужен сейчас</span>}
                        {r.barterTraders.length > 0 && <span className="inline-flex items-center gap-1">бартер у {r.barterTraders.map((t) => <TraderMark key={t} id={t} size={12} />)}</span>}
                      </div>
                    </td>
                    <td className="py-1.5 px-2">
                      {r.maps.length === 0 ? <span className="text-ink-4">—</span> : (
                        <div className="flex flex-wrap gap-1 max-w-[340px]">
                          {r.maps.slice(0, 4).map((m) => (
                            <Link key={m.id} to={`/maps?map=${m.normalizedName}&key=${r.item.id}`} className="chip h-6 hover:border-brass-3" title="Показать двери на карте">
                              <MapPin size={10} />{m.name} <span className="num opacity-70">{m.doors}</span>
                            </Link>
                          ))}
                          {r.maps.length > 4 && <span className="text-[11px] text-ink-4 self-center" title={r.maps.slice(4).map((m) => `${m.name} ${m.doors}`).join(', ')}>+{r.maps.length - 4}</span>}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-2 max-w-[320px]">
                      {r.tasks.length === 0 ? <span className="text-ink-4">—</span> : (
                        <div className="flex flex-col gap-0.5">
                          {r.tasks.filter((t) => preset !== 'quests' || !hideDone || t.view.status !== 'done').slice(0, 4).map((t) => (
                            <Link key={t.view.task.id} to={`/tasks?q=${encodeURIComponent(t.view.task.name)}`}
                              className={`truncate text-[12px] hover:text-brass-2 inline-flex items-center gap-1.5 ${t.view.status === 'done' ? 'text-ink-4 line-through' : t.view.status === 'available' ? 'text-ink' : 'text-ink-3'}`}
                              title={t.view.status === 'done' ? 'выполнен' : t.view.status === 'available' ? 'доступен' : `впереди (ур. ${t.view.task.minPlayerLevel})`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.view.status === 'done' ? 'bg-ink-4' : t.view.status === 'available' ? 'bg-fir' : 'bg-ink-3'}`} />
                              <span className="truncate">{t.view.task.name}</span>
                              {t.map && data.maps[t.map] && <span className="text-ink-4 shrink-0">· {data.maps[t.map].name}</span>}
                            </Link>
                          ))}
                          {r.tasks.length > 4 && <span className="text-[11px] text-ink-4">и ещё {r.tasks.length - 4}</span>}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right num text-ink-3">{r.uses == null ? <InfinityIcon size={13} className="inline" /> : r.uses}</td>
                    <td className="py-1.5 px-2 text-right">
                      {r.buy ? (
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          {r.buy.source === 'trader' && r.buy.trader ? <TraderMark id={r.buy.trader} size={16} /> : <span className="text-[10px] uppercase tracking-[.1em] text-info">рынок</span>}
                          <Price value={r.buy.price} />
                        </span>
                      ) : r.flea ? <span className="inline-flex items-center gap-1.5"><span className="text-[10px] uppercase tracking-[.1em] text-ink-4">рынок</span><Price value={r.flea} dim /></span> : <span className="text-ink-4">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right"><Price value={perUse} dim /></td>
                    <td className="py-1.5 px-2 text-right">
                      {r.spawns > 0
                        ? <Link to={`/maps?item=${r.item.id}`} className="num text-ink-2 hover:text-brass-2" title="Где может лежать — на карте">{r.spawns}</Link>
                        : <span className="text-ink-4">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {list.length > 300 && <div className="py-2 text-center text-[12px] text-ink-4">Показаны первые 300 — уточни поиск</div>}
        </div>
      )}
    </div>
  )
}

