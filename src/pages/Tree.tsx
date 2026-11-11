import { useMemo, useState } from 'react'
import { Check, ChevronRight, ExternalLink, Lock, MapPin, X } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import { buildChains, type TreeNode } from '@/lib/tree'
import { objectiveLabel, prerequisites, dependents, type TaskView } from '@/lib/tasks'
import { rub } from '@/lib/format'
import { ItemCell } from '@/components/ItemCell'
import { Chip, Empty, TraderMark } from '@/components/ui'
import { ROUBLES } from '@/data/types'
import { toast } from '@/store/toast'

// порядок торговцев по прогрессии, а не по алфавиту
const TRADER_ORDER = ['prapor', 'therapist', 'skier', 'peacekeeper', 'mechanic', 'ragman', 'jaeger', 'ref', 'fence', 'lightkeeper', 'btr-driver']

const STATUS_CLS: Record<TaskView['status'], string> = {
  done: 'border-fir/60 bg-fir/10 opacity-70',
  available: 'border-brass bg-brass/10 shadow-[0_0_12px_-4px] shadow-brass/40',
  locked: 'border-line bg-bg-2 text-ink-3',
}

export function TreePage() {
  const data = useGame()
  const views = useTaskViews()
  const kappaOnly = useProfile((s) => s.kappaOnly)
  const setKappaOnly = useProfile((s) => s.setKappaOnly)

  const traders = useMemo(() => {
    const seen = new Set<string>()
    for (const v of views.values()) seen.add(v.task.trader)
    const order = (t: { normalizedName: string }) => {
      const i = TRADER_ORDER.indexOf(t.normalizedName)
      return i === -1 ? TRADER_ORDER.length : i
    }
    return Object.values(data.traders)
      .filter((t) => seen.has(t.id))
      .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'ru'))
  }, [data, views])
  const [trader, setTrader] = useState<string | null>(null)
  const activeTrader = trader ?? traders[0]?.id ?? null

  const [selected, setSelected] = useState<string | null>(null)

  const chains = useMemo(() => {
    if (!activeTrader) return []
    let filtered = views
    if (kappaOnly) {
      filtered = new Map([...views].filter(([, v]) => v.task.kappaRequired))
    }
    return buildChains(data, filtered, activeTrader)
  }, [data, views, activeTrader, kappaOnly])

  const counts = useMemo(() => {
    let done = 0, total = 0
    for (const c of chains) { done += c.doneCount; total += c.total }
    return { done, total }
  }, [chains])

  const selectedView = selected ? views.get(selected) : undefined

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-w-0 overflow-auto p-5 flex flex-col gap-4">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="display text-[34px] text-ink">Дерево квестов</h1>
            <div className="mt-1 text-[13px] text-ink-3 num">
              {data.traders[activeTrader ?? '']?.name ?? ''} · <span className="text-fir">{counts.done}</span> из {counts.total} выполнено
            </div>
          </div>
          <Chip on={kappaOnly} onClick={() => setKappaOnly(!kappaOnly)} title="Только квесты, нужные для контейнера Каппа">Каппа</Chip>
        </header>

        <div className="flex gap-2 flex-wrap">
          {traders.map((t) => {
            const active = t.id === activeTrader
            const doneN = [...views.values()].filter((v) => v.task.trader === t.id && v.status === 'done').length
            const totalN = [...views.values()].filter((v) => v.task.trader === t.id).length
            return (
              <button
                key={t.id}
                type="button"
                title={`${t.name} · ${doneN}/${totalN}`}
                onClick={() => { setTrader(t.id); setSelected(null) }}
                className={`relative rounded-full transition-all ${active ? 'ring-2 ring-brass ring-offset-2 ring-offset-bg' : 'opacity-60 hover:opacity-100'}`}
              >
                <img src={t.imageLink} alt={t.name} className="w-10 h-10 rounded-full object-cover border border-line-2" />
                <span className={`absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full border text-[10px] num leading-none ${doneN === totalN ? 'bg-fir/20 text-fir border-fir/50' : 'bg-bg-3 text-ink-2 border-line-2'}`}>
                  {doneN}
                </span>
              </button>
            )
          })}
        </div>

        {chains.length === 0 ? (
          <Empty title="Пусто" hint="У этого торговца нет квестов под текущие фильтры." />
        ) : (
          <div className="flex flex-col gap-3 pb-4">
            {chains.map((c, i) => (
              <ChainRibbon key={i} chain={c} selected={selected} onSelect={setSelected} singles={c.columns.length === 1 && c.columns[0].every((n) => n.prev.length === 0 && n.next.length === 0)} />
            ))}
          </div>
        )}
      </div>

      {selectedView && (
        <DetailPanel view={selectedView} onClose={() => setSelected(null)} onJump={(id) => setSelected(id)} />
      )}
    </div>
  )
}

function ChainRibbon({ chain, selected, onSelect, singles }: {
  chain: ReturnType<typeof buildChains>[number]
  selected: string | null
  onSelect: (id: string) => void
  singles: boolean
}) {
  return (
    <section className="panel p-3 overflow-x-auto">
      <div className="flex items-center gap-3 mb-2 px-1">
        <span className="eyebrow text-[10px] text-ink-3">
          {singles ? 'Одиночные' : chain.minLevel > 0 ? `с ${chain.minLevel} ур.` : 'стартовая'}
        </span>
        <span className="num text-[11px] text-ink-4">{chain.doneCount}/{chain.total}</span>
        {chain.doneCount === chain.total && <Check size={12} className="text-fir" />}
      </div>
      <div className="flex items-center min-w-max">
        {chain.columns.map((col, ci) => (
          <div key={ci} className="flex items-center">
            {ci > 0 && <ChevronRight size={16} className="mx-1 shrink-0 text-ink-4" />}
            <div className={`flex gap-1.5 ${singles ? 'flex-row flex-wrap max-w-[900px]' : 'flex-col justify-center'}`}>
              {col.map((n) => (
                <QuestNode key={n.view.task.id} node={n} selected={selected === n.view.task.id} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function QuestNode({ node, selected, onSelect }: { node: TreeNode; selected: boolean; onSelect: (id: string) => void }) {
  const t = node.view.task
  const s = node.view.status
  return (
    <button
      type="button"
      onClick={() => onSelect(t.id)}
      title={t.name}
      className={`relative w-[168px] shrink-0 rounded-[5px] border px-2 py-1.5 text-left transition-colors hover:border-ink-4 ${STATUS_CLS[s]} ${selected ? 'ring-1 ring-brass' : ''}`}
    >
      <div className={`display text-[11.5px] leading-tight line-clamp-2 ${s === 'locked' ? 'text-ink-3' : 'text-ink'}`}>{t.name}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-3">
        {s === 'locked' && <Lock size={9} className="shrink-0" />}
        {s === 'done' && <Check size={10} className="shrink-0 text-fir" />}
        {t.minPlayerLevel > 0 && <span className="num">{t.minPlayerLevel} ур.</span>}
        {t.kappaRequired && <span className="display text-[9px] text-brass border border-brass-3 rounded-[2px] px-0.5 leading-[12px]">К</span>}
        {t.lightkeeperRequired && <span className="display text-[9px] text-info border border-info/50 rounded-[2px] px-0.5 leading-[12px]">С</span>}
        {node.external.length > 0 && (
          <span className="truncate text-ink-4" title={`После: ${node.external.map((e) => e.name).join(', ')}`}>⟵ {node.external[0].name}{node.external.length > 1 ? ` +${node.external.length - 1}` : ''}</span>
        )}
      </div>
    </button>
  )
}

function DetailPanel({ view, onClose, onJump }: { view: TaskView; onClose: () => void; onJump: (id: string) => void }) {
  const data = useGame()
  const views = useTaskViews()
  const toggle = useProfile((s) => s.toggleTask)
  const completeMany = useProfile((s) => s.completeMany)
  const uncompleteMany = useProfile((s) => s.uncompleteMany)
  const t = view.task
  const done = view.status === 'done'

  const missingPrereqs = useMemo(() => prerequisites(data, t.id).filter((id) => views.get(id)?.status !== 'done'), [data, t.id, views])
  const dependentDone = useMemo(() => done ? dependents(data, t.id).filter((id) => views.get(id)?.status === 'done') : [], [data, t.id, views, done])
  const opens = useMemo(
    () => Object.values(data.tasks).filter((x) => x.taskRequirements.some((r) => r.task === t.id && (r.status.includes('complete') || r.status.includes('active')))),
    [data, t.id],
  )

  const onToggle = () => {
    if (done) {
      if (dependentDone.length && confirm(`Снять отметку также с ${dependentDone.length} зависимых квестов?`)) { uncompleteMany([t.id, ...dependentDone]); toast(`Отметка снята: ${t.name} (и ${dependentDone.length} зависимых)`, 'info') }
      else { toggle(t.id, false); toast(`Отметка снята: ${t.name}`, 'info') }
      return
    }
    if (missingPrereqs.length) { completeMany([t.id, ...missingPrereqs]); toast(`Выполнено: ${t.name} (и ${missingPrereqs.length} предыдущих)`) }
    else { toggle(t.id, true); toast(`Выполнено: ${t.name}`) }
  }

  const money = t.rewardItems.find((r) => r.item === ROUBLES)?.count ?? 0
  const itemRewards = t.rewardItems.filter((r) => r.item !== ROUBLES && data.items[r.item])
  const statusLabel = view.status === 'done' ? 'Выполнен' : view.status === 'available' ? 'Доступен' : 'Впереди'
  const statusCls = view.status === 'done' ? 'text-fir border-fir/50 bg-fir/10' : view.status === 'available' ? 'text-brass-2 border-brass-3 bg-brass/10' : 'text-ink-3 border-line-2 bg-bg-2'

  return (
    <aside className="w-[340px] shrink-0 border-l border-line bg-bg-1 overflow-y-auto p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <TraderMark id={t.trader} size={34} />
        <div className="flex-1 min-w-0">
          <div className="display text-[18px] text-ink leading-tight">{t.name}</div>
          <div className="mt-0.5 text-[12px] text-ink-3">
            {data.traders[t.trader]?.name}
            {t.minPlayerLevel > 0 && <> · <span className="num">{t.minPlayerLevel} ур.</span></>}
            {t.map && <span className="inline-flex items-center gap-1"> · <MapPin size={11} />{data.maps[t.map]?.name}</span>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink"><X size={16} /></button>
      </div>

      <div className="flex items-center gap-2">
        <span className={`display text-[10px] uppercase tracking-[.08em] rounded-[3px] border px-1.5 py-[2px] ${statusCls}`}>{statusLabel}</span>
        {t.kappaRequired && <span className="display text-[10px] text-brass border border-brass-3 rounded-[3px] px-1 py-[2px]" title="Нужен для Каппы">К</span>}
        {t.lightkeeperRequired && <span className="display text-[10px] text-info border border-info/50 rounded-[3px] px-1 py-[2px]" title="Нужен для Смотрителя">С</span>}
        {t.wikiLink && (
          <a href={t.wikiLink} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-brass-2">
            Вики <ExternalLink size={12} />
          </a>
        )}
      </div>

      {view.missing.length > 0 && (
        <div className="panel p-2.5">
          <div className="eyebrow text-[10px] text-ink-3 mb-1.5">После</div>
          <div className="flex flex-col gap-1">
            {view.missing.map((m) => (
              <button key={m.id} type="button" onClick={() => onJump(m.id)} className="flex items-center gap-1.5 text-[12.5px] text-ink-2 hover:text-brass-2 text-left">
                <Lock size={11} className="shrink-0 text-ink-4" /><span className="truncate">{m.name}</span>
                <span className="ml-auto text-[11px] text-ink-4 shrink-0">{data.traders[m.trader]?.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel p-2.5">
        <div className="eyebrow text-[10px] text-ink-3 mb-1.5">Цели</div>
        <ul className="flex flex-col gap-1 text-[12.5px] text-ink-2">
          {t.objectives.filter((o) => !o.optional).map((o) => (
            <li key={o.id} className="flex gap-1.5">
              <span className="text-ink-4 shrink-0">{objectiveLabel(o.type)}</span>
              <span className="min-w-0">{o.description || o.items?.map((i) => data.items[i]?.shortName ?? data.items[i]?.name).filter(Boolean).join(', ') || ''}{(o.count ?? 0) > 1 ? ` ×${o.count}` : ''}</span>
            </li>
          ))}
        </ul>
      </div>

      {(money > 0 || itemRewards.length > 0 || t.experience > 0) && (
        <div className="panel p-2.5">
          <div className="eyebrow text-[10px] text-ink-3 mb-1.5">Награды</div>
          <div className="flex items-center gap-2 flex-wrap text-[12.5px] text-ink-2">
            {t.experience > 0 && <span className="num">{t.experience.toLocaleString('ru')} опыта</span>}
            {money > 0 && <span className="num">{rub(money)}</span>}
            {itemRewards.map((r) => <ItemCell key={r.item} item={data.items[r.item]} size={30} count={r.count} />)}
          </div>
        </div>
      )}

      {opens.length > 0 && (
        <div className="panel p-2.5">
          <div className="eyebrow text-[10px] text-ink-3 mb-1.5">Открывает</div>
          <div className="flex flex-col gap-1">
            {opens.map((o) => (
              <button key={o.id} type="button" onClick={() => onJump(o.id)} className="flex items-center gap-1.5 text-[12.5px] text-ink-2 hover:text-brass-2 text-left">
                <ChevronRight size={11} className="shrink-0 text-ink-4" /><span className="truncate">{o.name}</span>
                <span className="ml-auto text-[11px] text-ink-4 shrink-0">{data.traders[o.trader]?.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        className={`mt-auto rounded-[5px] border px-3 py-2 display text-[12px] uppercase tracking-[.08em] transition-colors ${done ? 'border-line-2 text-ink-3 hover:border-danger hover:text-danger' : 'border-fir/60 bg-fir/10 text-fir hover:bg-fir/20'}`}
      >
        {done ? 'Снять отметку' : missingPrereqs.length ? `Выполнено (+${missingPrereqs.length} предыдущих)` : 'Выполнено'}
      </button>
    </aside>
  )
}
