import { useMemo, useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, ExternalLink, KeyRound, Lock, MapPin, Search } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import { dependents, objectiveLabel, prerequisites, type TaskStatus, type TaskView } from '@/lib/tasks'
import { search } from '@/lib/search'
import { rub } from '@/lib/format'
import { ItemCell } from '@/components/ItemCell'
import { Chip, Eyebrow, FirBadge, Segmented, TraderMark, Toggle, Empty } from '@/components/ui'
import { ROUBLES } from '@/data/types'
import { CURRENCY } from '@/lib/needs'

type Filter = 'all' | TaskStatus

export function TasksPage() {
  const data = useGame()
  const views = useTaskViews()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState<Filter>('all')
  const [trader, setTrader] = useState<string | null>(null)
  const [map, setMap] = useState<string | null>(null)
  const kappaOnly = useProfile((s) => s.kappaOnly)
  const setKappaOnly = useProfile((s) => s.setKappaOnly)

  useEffect(() => {
    const pq = params.get('q')
    if (pq != null) { setQ(pq); setFilter('all'); setParams({}, { replace: true }) }
  }, [params, setParams])

  const all = useMemo(() => [...views.values()], [views])
  const counts = useMemo(() => {
    const c = { done: 0, available: 0, locked: 0 }
    for (const v of all) c[v.status]++
    return c
  }, [all])

  const list = useMemo(() => {
    let l = all
    if (filter !== 'all') l = l.filter((v) => v.status === filter)
    if (trader) l = l.filter((v) => v.task.trader === trader)
    if (map) l = l.filter((v) => v.task.map === map || v.task.objectives.some((o) => o.maps.includes(map)))
    if (kappaOnly) l = l.filter((v) => v.task.kappaRequired)
    if (q.trim()) {
      const found = new Set(search(q, l.map((v) => v.task), 200).map((t) => t.id))
      l = l.filter((v) => found.has(v.task.id))
    }
    const order: Record<TaskStatus, number> = { available: 0, locked: 1, done: 2 }
    return [...l].sort((a, b) =>
      order[a.status] - order[b.status] || a.task.minPlayerLevel - b.task.minPlayerLevel || a.task.name.localeCompare(b.task.name, 'ru'))
  }, [all, filter, trader, map, kappaOnly, q])

  const traders = useMemo(() => Object.values(data.traders).filter((t) => all.some((v) => v.task.trader === t.id)), [data, all])
  const maps = useMemo(() => Object.values(data.maps).filter((m) => all.some((v) => v.task.map === m.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [data, all])

  return (
    <div className="p-5 max-w-[1100px] mx-auto flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Задачи</h1>
          <div className="mt-1 text-[13px] text-ink-3 num">
            <span className="text-fir">{counts.available}</span> доступно · {counts.locked} впереди · {counts.done} выполнено
          </div>
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'available', label: 'Доступные' },
            { value: 'locked', label: 'Впереди' },
            { value: 'done', label: 'Выполненные' },
          ]}
        />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название квеста" className="input focus:input-focus pl-8 w-64" />
        </label>
        <div className="flex gap-1">
          {traders.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.name}
              onClick={() => setTrader(trader === t.id ? null : t.id)}
              className={`rounded-[4px] border transition-all ${trader === t.id ? 'border-brass ring-1 ring-brass/40' : trader ? 'border-transparent opacity-50 hover:opacity-100' : 'border-transparent hover:border-line-2'}`}
            >
              <TraderMark id={t.id} size={30} className="border-0" />
            </button>
          ))}
        </div>
        <select value={map ?? ''} onChange={(e) => setMap(e.target.value || null)} className="input focus:input-focus w-44">
          <option value="">Любая карта</option>
          {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Chip on={kappaOnly} onClick={() => setKappaOnly(!kappaOnly)} title="Только квесты, нужные для контейнера Каппа">Каппа</Chip>
      </div>

      {list.length === 0 ? (
        <Empty title="Ничего не найдено" hint="Смени фильтры или проверь уровень в профиле — квесты выше уровня показываются как «впереди»." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((v) => <TaskRow key={v.task.id} view={v} />)}
        </ul>
      )}
    </div>
  )
}

function TaskRow({ view }: { view: TaskView }) {
  const data = useGame()
  const views = useTaskViews()
  const toggle = useProfile((s) => s.toggleTask)
  const completeMany = useProfile((s) => s.completeMany)
  const uncompleteMany = useProfile((s) => s.uncompleteMany)
  const [open, setOpen] = useState(false)
  const t = view.task
  const done = view.status === 'done'
  const locked = view.status === 'locked'

  const itemObjectives = t.objectives.filter((o) => o.items?.length && (o.type === 'giveItem' || o.type === 'plantItem' || (o.type === 'findItem' && !t.objectives.some((g) => g.type === 'giveItem' && g.items?.[0] === o.items?.[0]))))
  const money = t.rewardItems.find((r) => r.item === ROUBLES)?.count ?? 0
  const missingPrereqs = useMemo(() => prerequisites(data, t.id).filter((id) => views.get(id)?.status !== 'done'), [data, t.id, views])
  const dependentDone = useMemo(() => done ? dependents(data, t.id).filter((id) => views.get(id)?.status === 'done') : [], [data, t.id, views, done])

  const onToggle = () => {
    if (done) {
      if (dependentDone.length) {
        if (confirm(`Снять отметку также с ${dependentDone.length} зависимых квестов?`)) uncompleteMany([t.id, ...dependentDone])
        else toggle(t.id, false)
      } else toggle(t.id, false)
      return
    }
    if (missingPrereqs.length) {
      completeMany([t.id, ...missingPrereqs])
    } else toggle(t.id, true)
  }

  return (
    <li className={`panel transition-colors ${done ? 'opacity-55' : ''} ${open ? 'border-line-2' : ''}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          title={done ? 'Снять отметку' : missingPrereqs.length ? `Отметить выполненным вместе с ${missingPrereqs.length} предыдущими` : 'Отметить выполненным'}
          className={`w-6 h-6 shrink-0 rounded-[4px] border grid place-items-center transition-colors
            ${done ? 'bg-fir/20 border-fir text-fir' : 'border-line-2 text-transparent hover:border-brass hover:text-brass/60'}`}
        >
          <Check size={15} strokeWidth={3} />
        </button>
        <TraderMark id={t.trader} size={30} />
        <button type="button" onClick={() => setOpen(!open)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`display text-[17px] truncate ${locked ? 'text-ink-2' : 'text-ink'}`}>{t.name}</span>
            {t.kappaRequired && <span className="shrink-0 display text-[10px] text-brass border border-brass-3 rounded-[3px] px-1 leading-[14px]" title="Нужен для Каппы">К</span>}
            {t.lightkeeperRequired && <span className="shrink-0 display text-[10px] text-info border border-info/50 rounded-[3px] px-1 leading-[14px]" title="Нужен для Смотрителя">С</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
            {t.minPlayerLevel > 0 && <span className={`num ${view.levelLocked ? 'text-danger' : ''}`}>{t.minPlayerLevel} ур.</span>}
            {t.map && <span className="inline-flex items-center gap-1"><MapPin size={11} />{data.maps[t.map]?.name}</span>}
            {locked && view.missing.length > 0 && (
              <span className="inline-flex items-center gap-1 truncate"><Lock size={11} />после: {view.missing.map((m) => m.name).join(', ')}</span>
            )}
            {locked && view.traderLocked.map((l) => (
              <span key={l.trader} className="inline-flex items-center gap-1"><Lock size={11} />{data.traders[l.trader]?.name} ур. {l.level}</span>
            ))}
          </div>
        </button>
        <div className="hidden sm:flex items-center gap-1">
          {itemObjectives.slice(0, 5).map((o) => {
            const it = data.items[o.items![0]]
            return it ? <ItemCell key={o.id} item={it} size={34} count={o.count} fir={o.foundInRaid} /> : null
          })}
        </div>
        {money > 0 && <span className="num text-[12px] text-ink-3 w-24 text-right hidden md:block">{rub(money)}</span>}
        <button type="button" onClick={() => setOpen(!open)} className="p-1 text-ink-3 hover:text-ink" aria-label="Подробнее">
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="border-t border-line px-3 py-3 grid gap-4 md:grid-cols-[1fr_260px]">
          <div>
            <Eyebrow>Условия</Eyebrow>
            <ul className="mt-2 flex flex-col gap-1.5">
              {t.objectives.map((o) => {
                const it = o.items?.[0] ? data.items[o.items[0]] : null
                const qi = o.questItem ? data.questItems[o.questItem] : null
                const mapId = o.maps[0] ?? t.map
                return (
                  <li key={o.id} className={`flex items-start gap-2 text-[13px] ${o.optional ? 'text-ink-3' : ''}`}>
                    <span className="eyebrow mt-[3px] w-[76px] shrink-0 text-right">{objectiveLabel(o.type)}</span>
                    {it && <ItemCell item={it} size={30} count={o.count} fir={o.foundInRaid} />}
                    {qi?.iconLink && <img src={qi.iconLink} alt="" className="w-[30px] h-[30px] object-contain rounded-[3px] border border-line-2 ibg-yellow" title={qi.name} />}
                    <span className="flex-1 pt-1">
                      {o.description}
                      {o.items && o.items.length > 1 && <span className="text-ink-3"> (любой из {o.items.length})</span>}
                      {o.foundInRaid && <FirBadge className="ml-2" />}
                      {o.optional && <span className="ml-2 text-[10px] uppercase tracking-[.1em] text-ink-4">необязательно</span>}
                    </span>
                    {(o.zones?.length || (mapId && (o.type === 'visit' || o.type === 'mark' || o.type === 'plantItem' || o.type === 'plantQuestItem' || o.type === 'findQuestItem'))) && mapId && data.maps[mapId] && (
                      <Link to={`/maps?map=${data.maps[mapId].normalizedName}&task=${t.id}`} className="pt-1 text-ink-3 hover:text-brass-2" title="Показать на карте"><MapPin size={14} /></Link>
                    )}
                  </li>
                )
              })}
            </ul>
            {t.neededKeys.length > 0 && (
              <div className="mt-3">
                <Eyebrow>Ключи</Eyebrow>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {t.neededKeys.flatMap((k) => k.keys).map((k) => data.items[k] && (
                    <span key={k} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2"><ItemCell item={data.items[k]} size={26} /><KeyRound size={11} className="text-ink-3" />{data.items[k].shortName}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <Eyebrow>Награда</Eyebrow>
              <div className="mt-1.5 text-[13px] flex flex-col gap-1">
                <span className="num text-ink-2">+{t.experience.toLocaleString('ru-RU')} опыта</span>
                {t.rewardStanding.map((r) => (
                  <span key={r.trader} className="flex items-center gap-1.5 text-ink-2"><TraderMark id={r.trader} size={14} /> <span className={`num ${r.standing < 0 ? 'text-danger' : 'text-fir'}`}>{r.standing > 0 ? '+' : ''}{r.standing.toFixed(2)}</span></span>
                ))}
                <div className="flex flex-wrap gap-1 mt-1">
                  {t.rewardItems.filter((r) => !CURRENCY.has(r.item)).map((r) => data.items[r.item] && (
                    <ItemCell key={r.item} item={data.items[r.item]} size={30} count={r.count} title={`${data.items[r.item].name} ×${r.count}`} />
                  ))}
                </div>
              </div>
            </div>
            <a href={t.wikiLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-brass-2">Вики <ExternalLink size={11} /></a>
            {!done && missingPrereqs.length > 0 && (
              <Toggle value={false} onChange={() => completeMany([t.id, ...missingPrereqs])} label={`Выполнено вместе с ${missingPrereqs.length} предыдущими`} />
            )}
          </div>
        </div>
      )}
    </li>
  )
}
