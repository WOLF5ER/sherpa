import { useMemo, useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, ExternalLink, KeyRound, Lock, MapPin, Search } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import { dependents, objectiveLabel, prerequisites, visibleForFaction, type TaskStatus, type TaskView } from '@/lib/tasks'
import { search } from '@/lib/search'
import { rub } from '@/lib/format'
import { ItemCell } from '@/components/ItemCell'
import { WikiPics } from '@/components/WikiPics'
import { Chip, Eyebrow, FirBadge, Progress, Segmented, TraderMark, Toggle, Empty } from '@/components/ui'
import { ROUBLES } from '@/data/types'
import { EVENT_LABEL, eventActive } from '@/data/eventTasks'
import { CURRENCY } from '@/lib/needs'
import { toast } from '@/store/toast'

type Filter = 'all' | TaskStatus

const PATCH_RU: Record<string, string> = {
  factionName: 'фракция', minPlayerLevel: 'уровень', traderRequirements: 'уровень торговца', taskRequirements: 'предшественники',
  otherRequirements: 'сюжет', zones: 'координаты',
}

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
  const showEvents = useProfile((s) => s.showEvents)
  const setShowEvents = useProfile((s) => s.setShowEvents)

  // ?task=<id> — переход с карты: находим квест по имени, раскрываем и подсвечиваем строку
  const [focusId, setFocusId] = useState<string | null>(null)
  useEffect(() => {
    const pq = params.get('q')
    const pt = params.get('task')
    if (pt && data.tasks[pt]) { setQ(data.tasks[pt].name); setFilter('all'); setTrader(null); setMap(null); setFocusId(pt); setParams({}, { replace: true }); return }
    if (pq != null) { setQ(pq); setFilter('all'); setParams({}, { replace: true }) }
  }, [params, setParams, data])

  const all = useMemo(() => [...views.values()], [views])
  const faction = useProfile((s) => s.faction)
  // ивент гаснет сам по дате окончания (EVENT_ENDS) и прячется тумблером «Событие»
  const hasEvents = useMemo(() => all.some((v) => v.task.event), [all])
  const eventsOn = showEvents && eventActive()
  // сколько квестов скрыто из-за фракции — видно, что фильтр работает, и понятно, куда делись квесты
  const hiddenByFaction = useMemo(
    () => Object.values(data.tasks).filter((t) => !visibleForFaction(t, faction)).length,
    [data, faction],
  )
  const counts = useMemo(() => {
    const c = { done: 0, available: 0, locked: 0 }
    for (const v of all) c[v.status]++
    return c
  }, [all])

  const list = useMemo(() => {
    let l = all
    if (!eventsOn) l = l.filter((v) => !v.task.event)
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
  }, [all, filter, trader, map, kappaOnly, q, eventsOn])

  const traders = useMemo(() => Object.values(data.traders).filter((t) => all.some((v) => v.task.trader === t.id)), [data, all])
  const maps = useMemo(() => Object.values(data.maps).filter((m) => all.some((v) => v.task.map === m.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [data, all])

  return (
    <div className="p-5 max-w-[1100px] mx-auto flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Задачи</h1>
          <div className="mt-1 text-[13px] text-ink-3 num">
            <span className="text-fir">{counts.available}</span> доступно · {counts.locked} впереди · {counts.done} выполнено
            {hiddenByFaction > 0 && (
              <span
                className="text-ink-4"
                title={`Квесты ${faction === 'USEC' ? 'BEAR' : 'USEC'} в списке не показываются — фракция выбирается в профиле`}
              >
                {' '}· {hiddenByFaction} чужой фракции скрыто
              </span>
            )}
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
        <div className="flex gap-2">
          {traders.map((t) => {
            const avail = all.filter((v) => v.task.trader === t.id && v.status === 'available').length
            const active = trader === t.id
            return (
              <button
                key={t.id}
                type="button"
                title={`${t.name} · доступно ${avail}`}
                onClick={() => setTrader(active ? null : t.id)}
                className={`relative rounded-full transition-all ${active ? 'ring-2 ring-brass ring-offset-2 ring-offset-bg' : trader ? 'opacity-45 hover:opacity-100' : 'hover:ring-2 hover:ring-line-2 hover:ring-offset-2 hover:ring-offset-bg'}`}
              >
                <img src={t.imageLink} alt={t.name} className="w-10 h-10 rounded-full object-cover border border-line-2" />
                {avail > 0 && (
                  <span className={`absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full border text-[10px] num leading-none ${active ? 'bg-brass text-bg border-brass' : 'bg-bg-3 text-ink-2 border-line-2'}`}>
                    {avail}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <select value={map ?? ''} onChange={(e) => setMap(e.target.value || null)} className="input focus:input-focus w-44">
          <option value="">Любая карта</option>
          {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Chip on={kappaOnly} onClick={() => setKappaOnly(!kappaOnly)} title="Только квесты, нужные для контейнера Каппа">Каппа</Chip>
        {hasEvents && (
          <Chip on={showEvents} onClick={() => setShowEvents(!showEvents)} title={`Задания ивента «${EVENT_LABEL}» — собраны вручную, пока их нет в tarkov.dev`}>Событие</Chip>
        )}
      </div>

      {list.length === 0 ? (
        <Empty title="Ничего не найдено" hint="Смени фильтры или проверь уровень в профиле — квесты выше уровня показываются как «впереди»." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((v) => <TaskRow key={v.task.id} view={v} focus={v.task.id === focusId} />)}
        </ul>
      )}
    </div>
  )
}

function TaskRow({ view, focus = false }: { view: TaskView; focus?: boolean }) {
  const data = useGame()
  const rowRef = useRef<HTMLLIElement>(null)
  const views = useTaskViews()
  const toggle = useProfile((s) => s.toggleTask)
  const objectivesDone = useProfile((s) => s.objectivesDone)
  const toggleObjective = useProfile((s) => s.toggleObjective)
  const completeMany = useProfile((s) => s.completeMany)
  const uncompleteMany = useProfile((s) => s.uncompleteMany)
  const [open, setOpen] = useState(focus)
  useEffect(() => {
    if (!focus) return
    setOpen(true)
    // дать списку отрисоваться, затем проскроллить к строке
    const id = window.setTimeout(() => rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
    return () => window.clearTimeout(id)
  }, [focus])
  const t = view.task
  const done = view.status === 'done'
  const locked = view.status === 'locked'

  const itemObjectives = t.objectives.filter((o) => o.items?.length && (o.type === 'giveItem' || o.type === 'plantItem' || (o.type === 'findItem' && !t.objectives.some((g) => g.type === 'giveItem' && g.items?.[0] === o.items?.[0]))))
  const money = t.rewardItems.find((r) => r.item === ROUBLES)?.count ?? 0
  // сводка условий одной строкой: «устранить ×2 · найти» — чтобы середина строки не пустовала
  const objectiveSummary = useMemo(() => {
    const byType = new Map<string, number>()
    for (const o of t.objectives) {
      if (o.optional) continue
      const label = objectiveLabel(o.type)
      byType.set(label, (byType.get(label) ?? 0) + 1)
    }
    return [...byType.entries()].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(' · ')
  }, [t.objectives])
  // статус-пилюля по отмеченным пунктам: «готов к сдаче» / «в процессе» / ничего
  const reqObjs = t.objectives.filter((o) => !o.optional)
  const objsDone = reqObjs.filter((o) => objectivesDone[o.id]).length
  const pill: { text: string; cls: string } | null = done
    ? { text: 'Выполнено', cls: 'text-fir border-fir/50 bg-fir/10' }
    : reqObjs.length > 0 && objsDone === reqObjs.length
      ? { text: 'Готов к сдаче', cls: 'text-fir border-fir/50 bg-fir/10' }
      : objsDone > 0
        ? { text: `В процессе ${objsDone}/${reqObjs.length}`, cls: 'text-brass-2 border-brass-3 bg-brass/10' }
        : null
  const missingPrereqs = useMemo(() => prerequisites(data, t.id).filter((id) => views.get(id)?.status !== 'done'), [data, t.id, views])
  const dependentDone = useMemo(() => done ? dependents(data, t.id).filter((id) => views.get(id)?.status === 'done') : [], [data, t.id, views, done])

  const onToggle = () => {
    if (done) {
      if (dependentDone.length) {
        if (confirm(`Снять отметку также с ${dependentDone.length} зависимых квестов?`)) { uncompleteMany([t.id, ...dependentDone]); toast(`Отметка снята: ${t.name} (и ${dependentDone.length} зависимых)`, 'info') }
        else { toggle(t.id, false); toast(`Отметка снята: ${t.name}`, 'info') }
      } else { toggle(t.id, false); toast(`Отметка снята: ${t.name}`, 'info') }
      return
    }
    if (missingPrereqs.length) {
      completeMany([t.id, ...missingPrereqs])
      toast(`Выполнено: ${t.name} (и ${missingPrereqs.length} предыдущих)`)
    } else { toggle(t.id, true); toast(`Выполнено: ${t.name}`) }
  }

  return (
    <li ref={rowRef} className={`panel transition-colors ${done ? 'opacity-55' : ''} ${open ? 'border-line-2' : ''} ${focus ? 'ring-1 ring-brass/50' : ''}`}>
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
            <span className={`display text-[17px] truncate ${t.seasonal ? (locked ? 'text-season/70' : 'text-season') : locked ? 'text-ink-2' : 'text-ink'}`}>{t.name}</span>
            {t.kappaRequired && <span className="shrink-0 display text-[10px] text-brass border border-brass-3 rounded-[3px] px-1 leading-[14px]" title="Нужен для Каппы">К</span>}
            {t.lightkeeperRequired && <span className="shrink-0 display text-[10px] text-info border border-info/50 rounded-[3px] px-1 leading-[14px]" title="Нужен для Смотрителя">С</span>}
            {t.seasonal && <span className="shrink-0 display text-[10px] text-season border border-season/50 rounded-[3px] px-1 leading-[14px]" title="Сезонный квест — только для сезонного персонажа; данные собраны вручную, без точек на карте">СЕЗОН</span>}
            {t.event && <span className="shrink-0 display text-[10px] text-danger border border-danger/50 rounded-[3px] px-1 leading-[14px]" title={`Задание ивента «${EVENT_LABEL}» — данных нет в tarkov.dev, собрано вручную`}>СОБЫТИЕ</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
            <span className="text-ink-2">{data.traders[t.trader]?.name}</span>
            {t.minPlayerLevel > 0 && <span className={`num ${view.levelLocked ? 'text-danger' : ''}`}>{t.minPlayerLevel} ур.</span>}
            {!done && t.objectives.some((o) => objectivesDone[o.id]) && <span className="num text-fir">{t.objectives.filter((o) => objectivesDone[o.id]).length}/{t.objectives.length} пунктов</span>}
            {t.map && <span className="inline-flex items-center gap-1"><MapPin size={11} />{data.maps[t.map]?.name}</span>}
            {objectiveSummary && <span className="truncate text-ink-4">{objectiveSummary}</span>}
            {locked && view.missing.length > 0 && (
              <span className="inline-flex items-center gap-1 truncate"><Lock size={11} />после: {view.missing.map((m) => m.name).join(', ')}</span>
            )}
            {locked && view.traderLocked.map((l) => (
              <span key={l.trader} className="inline-flex items-center gap-1"><Lock size={11} />{data.traders[l.trader]?.name} ур. {l.level}</span>
            ))}
            {locked && view.repLocked.map((l) => (
              <span key={l.trader} className="inline-flex items-center gap-1" title="Репутация Скупщика (карма дикого) — задаётся в профиле"><Lock size={11} />{data.traders[l.trader]?.name} реп. {l.value}</span>
            ))}
            {locked && view.storyLocked && (
              <span className="inline-flex items-center gap-1" title="Квесты торговца выдаются по мере выполнения других его квестов на этом уровне лояльности (EFT 1.1); цепочки и сюжетные квесты не считаются"><Lock size={11} />{view.storyLocked.have < 0 ? `${data.traders[view.storyLocked.trader]?.name ?? ''} ур. ${view.storyLocked.ll}` : `квесты ${data.traders[view.storyLocked.trader]?.name ?? ''} ур. ${view.storyLocked.ll}: ${view.storyLocked.have} из ${view.storyLocked.need}`}</span>
            )}
            {locked && view.storyGate && (
              <span className="inline-flex items-center gap-1 truncate" title="Выдаётся по ходу сюжетной главы — отметь цель главы пройденной на вкладке «Сюжет»"><Lock size={11} />{view.storyGate}</span>
            )}
          </div>
          {!done && reqObjs.length > 0 && objsDone > 0 && (
            <Progress value={objsDone / reqObjs.length} className="mt-1.5 max-w-[240px]" />
          )}
        </button>
        <div className="hidden sm:flex items-center gap-1">
          {itemObjectives.slice(0, 5).map((o) => {
            const it = data.items[o.items![0]]
            return it ? <ItemCell key={o.id} item={it} size={34} count={o.count} fir={o.foundInRaid} /> : null
          })}
        </div>
        {money > 0 && <span className="num text-[12px] text-ink-3 w-24 text-right hidden md:block">{rub(money)}</span>}
        {pill && (
          <span className={`shrink-0 display text-[10px] uppercase tracking-[.08em] rounded-[3px] border px-1.5 py-[2px] ${pill.cls}`}>
            {pill.text}
          </span>
        )}
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
                const od = !!objectivesDone[o.id]
                return (
                  <li key={o.id} className={`flex items-start gap-2 text-[13px] ${o.optional ? 'text-ink-3' : ''} ${od ? 'opacity-50' : ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleObjective(o.id)}
                      title={od ? 'Пункт выполнен — снять отметку' : 'Отметить пункт выполненным'}
                      className={`mt-[3px] w-[18px] h-[18px] shrink-0 rounded-[3px] border grid place-items-center transition-colors ${od ? 'bg-fir/20 border-fir text-fir' : 'border-line-2 text-transparent hover:border-brass hover:text-brass/60'}`}
                    >
                      <Check size={12} strokeWidth={3} />
                    </button>
                    <span className="eyebrow mt-[3px] w-[76px] shrink-0 text-right">{objectiveLabel(o.type)}</span>
                    {it && <ItemCell item={it} size={30} count={o.count} fir={o.foundInRaid} />}
                    {qi?.iconLink && <img src={qi.iconLink} alt="" className="w-[30px] h-[30px] object-contain rounded-[3px] border border-line-2 ibg-yellow" title={qi.name} />}
                    <span className="flex-1 pt-1">
                      {o.description}
                      {o.items && o.items.length > 1 && <span className="text-ink-3"> (любой из {o.items.length})</span>}
                      {o.foundInRaid && <FirBadge className="ml-2" />}
                      {o.optional && <span className="ml-2 text-[10px] uppercase tracking-[.1em] text-ink-4">необязательно</span>}
                      {o.approx && <span className="ml-2 text-[11px] text-ink-4" title="Координаты сняты с карты вики, точность ±10–30 м">≈ на карте</span>}
                      {o.pics && o.pics.length > 0 && <WikiPics files={o.pics} className="mt-1.5" />}
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
            {t.note && <div className="text-[12px] text-ink-2 leading-4 border-l-2 border-season/60 pl-2">{t.note}</div>}
            {t.patched && (
              <div className="text-[11px] text-ink-3 leading-4" title="Поправки проекта tarkov-data-overlay (TarkovTracker), каждая подтверждена вики">
                поправлено по вики: {t.patched.map((k) => PATCH_RU[k] ?? k).join(', ')}
              </div>
            )}
            <a href={t.wikiLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-brass-2">{t.seasonal ? 'tarkov.help' : 'Вики'} <ExternalLink size={11} /></a>
            {!done && missingPrereqs.length > 0 && (
              <Toggle value={false} onChange={() => completeMany([t.id, ...missingPrereqs])} label={`Выполнено вместе с ${missingPrereqs.length} предыдущими`} />
            )}
          </div>
        </div>
      )}
    </li>
  )
}
