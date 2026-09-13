import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronDown } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import { computeNeeds, CURRENCY, needProgress, type Need } from '@/lib/needs'
import { search } from '@/lib/search'
import { rub } from '@/lib/format'
import { ROUBLES, DOLLARS, EUROS } from '@/data/types'
import { ItemCell } from '@/components/ItemCell'
import { useFreshPrices } from '@/lib/useFreshPrices'
import { Chip, Empty, FirBadge, Progress, Segmented, Stepper, Toggle, TraderMark } from '@/components/ui'

type Src = 'all' | 'tasks' | 'hideout'

const CUR_SIGN: Record<string, string> = { [ROUBLES]: '₽', [DOLLARS]: '$', [EUROS]: '€' }

export function NeedsPage() {
  const data = useGame()
  const views = useTaskViews()
  const stations = useProfile((s) => s.stations)
  const have = useProfile((s) => s.have)
  const kappaOnly = useProfile((s) => s.kappaOnly)
  const setKappaOnly = useProfile((s) => s.setKappaOnly)
  const includeLocked = useProfile((s) => s.showLockedTasks)
  const setIncludeLocked = useProfile((s) => s.setShowLockedTasks)
  const [allLevels, setAllLevels] = useState(false)
  const [src, setSrc] = useState<Src>('all')
  const [firOnly, setFirOnly] = useState(false)
  const [hideDone, setHideDone] = useState(true)
  const [q, setQ] = useState('')

  const needs = useMemo(
    () => computeNeeds(data, views, stations, have, { includeLocked, allHideoutLevels: allLevels, kappaOnly }),
    [data, views, stations, have, includeLocked, allLevels, kappaOnly],
  )

  const money = useMemo(() => needs.filter((n) => CURRENCY.has(n.item.id)), [needs])

  const list = useMemo(() => {
    let l = needs.filter((n) => !CURRENCY.has(n.item.id))
    if (src === 'tasks') l = l.filter((n) => n.questFir + n.questAny > 0)
    if (src === 'hideout') l = l.filter((n) => n.hideoutFir + n.hideoutAny > 0)
    if (firOnly) l = l.filter((n) => n.questFir + n.hideoutFir > 0)
    if (hideDone) l = l.filter((n) => n.have < n.total)
    if (q.trim()) {
      const ids = new Set(search(q, l.map((n) => n.item), 300).map((i) => i.id))
      l = l.filter((n) => ids.has(n.item.id))
    }
    return l.sort((a, b) => {
      const an = a.nowTotal > 0 ? 0 : 1
      const bn = b.nowTotal > 0 ? 0 : 1
      return an - bn || (b.total - b.have) - (a.total - a.have) || a.item.name.localeCompare(b.item.name, 'ru')
    })
  }, [needs, src, firOnly, hideDone, q])

  useFreshPrices(list.map((n) => n.item.id), 80)

  const totals = useMemo(() => {
    const l = needs.filter((n) => !CURRENCY.has(n.item.id))
    const total = l.reduce((s, n) => s + n.total, 0)
    const got = l.reduce((s, n) => s + Math.min(n.have, n.total), 0)
    return { items: l.length, total, got }
  }, [needs])

  return (
    <div className="p-5 max-w-[1100px] mx-auto flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Что нести из рейда</h1>
          <div className="mt-1 text-[13px] text-ink-3 num">
            {totals.items} позиций · собрано <span className="text-ink">{totals.got}</span> из {totals.total}
            {money.filter((m) => m.total > 0).map((m) => (
              <span key={m.item.id}> · {rub(m.total).replace(' ₽', '')} {CUR_SIGN[m.item.id] ?? m.item.shortName}</span>
            ))}
          </div>
        </div>
        <Segmented value={src} onChange={setSrc} options={[{ value: 'all', label: 'Всё' }, { value: 'tasks', label: 'Квесты' }, { value: 'hideout', label: 'Схрон' }]} />
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Предмет" className="input focus:input-focus pl-8 w-56" />
        </label>
        <Chip on={firOnly} onClick={() => setFirOnly(!firOnly)}>Только FIR</Chip>
        <Chip on={kappaOnly} onClick={() => setKappaOnly(!kappaOnly)}>Каппа</Chip>
        <Toggle value={includeLocked} onChange={setIncludeLocked} label="Квесты впереди" />
        <Toggle value={allLevels} onChange={setAllLevels} label="Схрон: все уровни" />
        <Toggle value={hideDone} onChange={setHideDone} label="Скрыть собранное" />
      </div>

      {list.length === 0 ? (
        <Empty title="Список пуст" hint={needs.length === 0 ? 'Задай уровень и отметь выполненные квесты в профиле — и здесь появится, что искать.' : 'Всё собрано или отфильтровано.'}>
          <Link to="/profile" className="chip chip-on">Открыть профиль</Link>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((n) => <NeedRow key={n.item.id} need={n} />)}
        </ul>
      )}
    </div>
  )
}

function NeedRow({ need }: { need: Need }) {
  const data = useGame()
  const setHave = useProfile((s) => s.setHave)
  const [open, setOpen] = useState(false)
  const it = need.item
  const fir = need.questFir + need.hideoutFir
  const any = need.questAny + need.hideoutAny
  const done = need.have >= need.total
  const later = need.nowTotal === 0

  return (
    <li className={`panel ${done ? 'opacity-50' : later ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <ItemCell item={it} size={44} fir={fir > 0} />
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => setOpen(!open)} className="text-left w-full">
            <div className="flex items-center gap-2">
              <span className="display text-[16px] text-ink truncate">{it.name}</span>
              {later && <span className="eyebrow text-ink-4">позже</span>}
            </div>
          </button>
          <div className="mt-0.5 flex items-center gap-3 text-[12px] text-ink-3">
            {fir > 0 && <span className="inline-flex items-center gap-1"><FirBadge /> <span className="num text-ink-2">{fir}</span></span>}
            {any > 0 && <span className="num">любые <span className="text-ink-2">{any}</span></span>}
            {need.questFir + need.questAny > 0 && <span className="num">квесты {need.questFir + need.questAny}</span>}
            {need.hideoutFir + need.hideoutAny > 0 && <span className="num">схрон {need.hideoutFir + need.hideoutAny}</span>}
          </div>
          <Progress value={needProgress(need)} className="mt-1.5 max-w-[260px]" />
        </div>
        <div className="flex items-center gap-2">
          <Stepper value={need.have} onChange={(v) => setHave(it.id, v)} />
          <span className="num text-ink-3 text-[13px] w-10">/ {need.total}</span>
        </div>
        <button type="button" onClick={() => setOpen(!open)} className="p-1 text-ink-3 hover:text-ink" aria-label="Источники">
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <ul className="border-t border-line px-3 py-2 flex flex-col gap-1 text-[13px]">
          {need.sources.map((s, i) => (
            <li key={i} className={`flex items-center gap-2 ${s.now ? '' : 'text-ink-3'}`}>
              {s.kind === 'task'
                ? <TraderMark id={data.tasks[s.id]?.trader ?? ''} size={16} />
                : <img src={data.stations[s.id.split('-')[0]]?.imageLink} alt="" className="w-4 h-4 object-contain opacity-80" />}
              <span className="flex-1 min-w-0 truncate">
                {s.kind === 'task'
                  ? <Link to={`/tasks?q=${encodeURIComponent(s.name)}`} className="hover:text-brass-2">{s.name}</Link>
                  : <>{s.name} · <span className="text-ink-3">{s.detail}</span></>}
                {s.alternatives && (
                  <span className="text-ink-3"> — или {s.alternatives.filter((a) => a !== it.id).map((a) => data.items[a]?.shortName).filter(Boolean).join(', ')}</span>
                )}
              </span>
              {s.fir && <FirBadge />}
              <span className="num text-ink-2">×{s.count}</span>
              <span className="eyebrow w-16 text-right">{s.now ? 'сейчас' : 'позже'}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
