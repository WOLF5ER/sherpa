import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, ArrowLeft, Save, Trash2, X, ChevronRight, RotateCcw, Wand2 } from 'lucide-react'
import { useGame } from '@/store/data'
import { useBuilds } from '@/store/builds'
import { usePriceCtx } from '@/lib/useCtx'
import { cheapestBuy, anyPrice } from '@/lib/flea'
import { caliberName, penClass } from '@/lib/caliber'
import { search } from '@/lib/search'
import { rub } from '@/lib/format'
import {
  buildFromPreset, newBuild, computeStats, candidates, optimize, setSlot, serialize, deserialize, scoreItem,
  type Build, type BuildNode, type Objective,
} from '@/lib/builder'
import type { Item } from '@/data/types'
import { ItemCell } from '@/components/ItemCell'
import { Empty, Eyebrow, Price, Segmented, Toggle, TraderMark } from '@/components/ui'

const PEN_COLORS = ['#767466', '#8a8a5a', '#9aa34a', '#a9b83a', '#8fc25a', '#6fc262', '#4fd07a']

export function BuilderPage() {
  const data = useGame()
  const [params, setParams] = useSearchParams()
  const weaponId = params.get('w')
  const weapon = weaponId ? data.items[weaponId] : null
  if (!weapon?.weapon) return <WeaponPicker onPick={(id, b) => setParams(b ? { w: id, b } : { w: id })} />
  return <Workbench key={weapon.id + (params.get('b') ?? '')} weapon={weapon} onBack={() => setParams({})} />
}

/* ── выбор оружия ─────────────────────────────────────────────────── */
function WeaponPicker({ onPick }: { onPick: (id: string, build?: string) => void }) {
  const data = useGame()
  const ctx = usePriceCtx()
  const builds = useBuilds((s) => s.builds)
  const remove = useBuilds((s) => s.remove)
  const [q, setQ] = useState('')
  const [caliber, setCaliber] = useState<string | null>(null)
  const weapons = useMemo(() => Object.values(data.items).filter((i) => i.weapon && i.slots?.length && !i.types.includes('preset')), [data])
  const calibers = useMemo(() => [...new Set(weapons.map((w) => w.weapon!.caliber))].sort((a, b) => caliberName(a).localeCompare(caliberName(b))), [weapons])
  const list = useMemo(() => {
    let l = weapons
    if (caliber) l = l.filter((w) => w.weapon!.caliber === caliber)
    if (q.trim()) l = search(q, l, 200)
    return [...l].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [weapons, caliber, q])

  return (
    <div className="p-5 max-w-[1100px] mx-auto flex flex-col gap-4">
      <header>
        <h1 className="display text-[34px] text-ink">Конструктор</h1>
        <div className="mt-1 text-[13px] text-ink-3">Выбери оружие — откроется его стандартный пресет. Дальше меняй модули по слотам или дай подобрать автоматически под эргономику, отдачу и бюджет.</div>
      </header>

      {builds.length > 0 && (
        <section>
          <Eyebrow>Мои сборки</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {builds.map((b) => data.items[b.weapon] && (
              <span key={b.id} className="inline-flex items-center gap-1 panel px-2 py-1">
                <button type="button" onClick={() => onPick(b.weapon, b.id)} className="inline-flex items-center gap-2 text-[13px] hover:text-brass-2">
                  <ItemCell item={data.items[b.weapon]} size={26} onClick={() => onPick(b.weapon, b.id)} />{b.name}
                </button>
                <button type="button" onClick={() => remove(b.id)} className="text-ink-4 hover:text-danger" title="Удалить"><Trash2 size={12} /></button>
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Оружие" className="input focus:input-focus pl-8 w-56" />
        </label>
        <select value={caliber ?? ''} onChange={(e) => setCaliber(e.target.value || null)} className="input focus:input-focus w-44">
          <option value="">Любой калибр</option>
          {calibers.map((c) => <option key={c} value={c}>{caliberName(c)}</option>)}
        </select>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((w) => {
          const def = w.weapon!.defaultPreset ? data.items[w.weapon!.defaultPreset] : null
          const price = def ? (cheapestBuy(def, ctx)?.price ?? anyPrice(def, ctx)) : (cheapestBuy(w, ctx)?.price ?? anyPrice(w, ctx))
          return (
            <button key={w.id} type="button" onClick={() => onPick(w.id)} className="panel px-3 py-2 flex items-center gap-3 text-left hover:border-line-2">
              <ItemCell item={def ?? w} size={44} onClick={() => onPick(w.id)} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink truncate">{w.shortName}</div>
                <div className="text-[11px] text-ink-3 num">{caliberName(w.weapon!.caliber)} · эрго {w.weapon!.defaultErgonomics ?? w.weapon!.ergonomics} · отдача {w.weapon!.defaultRecoilVertical ?? w.weapon!.recoilVertical}</div>
                <div className="text-[11px] text-ink-3 num">{rub(price)}</div>
              </div>
              <ChevronRight size={14} className="text-ink-4" />
            </button>
          )
        })}
      </div>
      {list.length === 0 && <Empty title="Не найдено" />}
    </div>
  )
}

/* ── верстак ──────────────────────────────────────────────────────── */
function Workbench({ weapon, onBack }: { weapon: Item; onBack: () => void }) {
  const data = useGame()
  const ctx = usePriceCtx()
  const [params] = useSearchParams()
  const saved = useBuilds((s) => s.builds)
  const saveBuild = useBuilds((s) => s.save)
  const w = weapon.weapon!
  const presets = useMemo(() => w.presets.map((id) => data.items[id]).filter(Boolean), [w, data])

  const [build, setBuild] = useState<Build>(() => {
    const bid = params.get('b')
    const sb = bid ? saved.find((b) => b.id === bid) : null
    if (sb) { const d = deserialize(data, sb.data); if (d) return d }
    return (w.defaultPreset ? buildFromPreset(data, w.defaultPreset) : null) ?? newBuild(data, weapon.id)
  })
  const [objective, setObjective] = useState<Objective>('balanced')
  const [budget, setBudget] = useState<string>('')
  const [onlyAvail, setOnlyAvail] = useState(true)
  const [fillOptional, setFillOptional] = useState(true)
  const [name, setName] = useState('')

  const stats = useMemo(() => computeStats(data, build, ctx), [data, build, ctx])
  const defPreset = w.defaultPreset ? data.items[w.defaultPreset]?.preset : null
  const ammo = useMemo(() => w.allowedAmmo.map((id) => data.items[id]).filter((a) => a?.ammo).sort((a, b) => b.ammo!.penetrationPower - a.ammo!.penetrationPower).slice(0, 10), [w, data])

  const runOptimize = () => {
    const b = parseInt(budget.replace(/\D/g, ''), 10)
    setBuild(optimize(data, build, ctx, { objective, budget: Number.isFinite(b) && b > 0 ? b : null, onlyAvailable: onlyAvail, fillOptional }))
  }
  const delta = (v: number, base: number | null | undefined, invert = false) => {
    if (base == null) return null
    const d = v - base
    if (!d) return null
    const good = invert ? d < 0 : d > 0
    return <span className={`num text-[11px] ml-1 ${good ? 'text-fir' : 'text-danger'}`}>{d > 0 ? '+' : ''}{d}</span>
  }

  return (
    <div className="p-5 max-w-[1300px] mx-auto flex flex-col gap-4">
      <header className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onBack} className="chip hover:text-ink"><ArrowLeft size={12} /> Оружие</button>
        <ItemCell item={weapon} size={44} />
        <div className="min-w-0">
          <h1 className="display text-[26px] text-ink leading-none">{weapon.name}</h1>
          <div className="mt-1 text-[12px] text-ink-3 num">{caliberName(w.caliber)} · {w.fireRate} выстр/мин · {w.fireModes.map((m) => m === 'single' ? 'одиночный' : m === 'fullauto' ? 'авто' : m === 'burst' ? 'очередь' : m).join(' / ')}</div>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {presets.length > 1 && (
            <select onChange={(e) => { const b = e.target.value && buildFromPreset(data, e.target.value); if (b) setBuild(b) }} defaultValue="" className="input focus:input-focus h-8 text-[12px] w-56">
              <option value="">Загрузить пресет…</option>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name.replace(weapon.name, '').trim() || p.shortName}{p.preset?.isDefault ? ' (стандарт)' : ''}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setBuild(newBuild(data, weapon.id))} className="chip hover:text-ink" title="Пустое оружие"><RotateCcw size={12} /> Пусто</button>
        </div>
      </header>

      {/* статы */}
      <section className="panel p-3 grid gap-3 md:grid-cols-[repeat(5,auto)_1fr] items-center">
        <Stat label="Эргономика" value={stats.ergonomics} extra={delta(stats.ergonomics, defPreset?.ergonomics)} />
        <Stat label="Отдача верт." value={stats.recoilVertical} extra={delta(stats.recoilVertical, defPreset?.recoilVertical, true)} />
        <Stat label="Отдача гориз." value={stats.recoilHorizontal} extra={delta(stats.recoilHorizontal, defPreset?.recoilHorizontal, true)} />
        <Stat label="Вес" value={`${stats.weight} кг`} />
        <Stat label="Модули" value={rub(stats.modsPrice)} extra={stats.unavailable ? <span className="text-[11px] text-danger ml-1" title="Недоступно на твоём уровне">{stats.unavailable} недоступно</span> : null} />
        <div className="text-[11px] text-ink-3 md:text-right">
          {stats.missingRequired.length > 0 ? <span className="text-danger">Не хватает обязательных: {stats.missingRequired.map((s) => s.name).join(', ')}</span> : 'Все обязательные слоты заняты'}
          {defPreset && <div className="text-ink-4">дельта — к стандартному пресету</div>}
        </div>
      </section>

      {/* оптимизация */}
      <section className="panel p-3 flex flex-wrap items-center gap-3">
        <Wand2 size={14} className="text-brass" />
        <Segmented value={objective} onChange={setObjective} options={[{ value: 'balanced', label: 'Баланс' }, { value: 'ergo', label: 'Эргономика' }, { value: 'recoil', label: 'Отдача' }, { value: 'cheap', label: 'Дешевле' }]} />
        <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">бюджет
          <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="без лимита" className="input focus:input-focus num h-8 w-28 text-[12px]" />
        </label>
        <Toggle value={onlyAvail} onChange={setOnlyAvail} label="Только доступное мне" />
        <Toggle value={fillOptional} onChange={setFillOptional} label="Заполнять необязательные" />
        <button type="button" onClick={runOptimize} className="chip chip-on">Подобрать</button>
        <div className="ml-auto flex items-center gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название сборки" className="input focus:input-focus h-8 w-44 text-[12px]" />
          <button type="button" onClick={() => { saveBuild(name.trim() || `${weapon.shortName} · ${stats.ergonomics}/${stats.recoilVertical}`, weapon.id, serialize(build)); setName('') }} className="chip hover:text-ink"><Save size={12} /> Сохранить</button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="flex flex-col gap-1">
          {build.nodes.map((n) => <SlotRow key={n.slot.id} node={n} build={build} depth={0} objective={objective} onChange={setBuild} />)}
        </section>

        <aside className="flex flex-col gap-4">
          <div>
            <Eyebrow>Патроны · {caliberName(w.caliber)}</Eyebrow>
            <ul className="mt-2 flex flex-col divide-y divide-line text-[12px]">
              {ammo.map((a) => {
                const buy = cheapestBuy(a, ctx)
                return (
                  <li key={a.id} className="py-1.5 flex items-center gap-2">
                    <ItemCell item={a} size={26} />
                    <span className="flex-1 truncate text-ink-2">{a.shortName}</span>
                    <span className="num" style={{ color: PEN_COLORS[penClass(a.ammo!.penetrationPower)] }}>{a.ammo!.penetrationPower}</span>
                    <span className="num text-ink-3 w-8 text-right">{a.ammo!.damage}</span>
                    <span className="w-16 text-right"><Price value={buy?.price ?? anyPrice(a, ctx)} dim={!buy} className="text-[11px]" /></span>
                  </li>
                )
              })}
            </ul>
            <div className="mt-1 text-[10px] text-ink-4">пробитие · урон · цена</div>
          </div>
          <div>
            <Eyebrow>Детали · {stats.parts.length}</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-1">
              {stats.parts.map((id, i) => data.items[id] && <ItemCell key={id + i} item={data.items[id]} size={30} />)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value, extra }: { label: string; value: string | number; extra?: React.ReactNode }) {
  return (
    <div className="px-2">
      <div className="eyebrow">{label}</div>
      <div className="num text-[20px] text-ink leading-tight">{value}{extra}</div>
    </div>
  )
}

/* ── строка слота с выбором модуля ────────────────────────────────── */
function SlotRow({ node, build, depth, objective, onChange }: { node: BuildNode; build: Build; depth: number; objective: Objective; onChange: (b: Build) => void }) {
  const data = useGame()
  const ctx = usePriceCtx()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const item = node.item ? data.items[node.item] : null

  const options = useMemo(() => {
    if (!open) return []
    const list = candidates(data, build, node.slot, node)
    const filtered = q.trim() ? search(q, list, 100) : list
    return filtered
      .map((it) => { const buy = cheapestBuy(it, ctx); const price = buy?.price ?? anyPrice(it, ctx); return { it, buy, price, score: scoreItem(it, objective, price) } })
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
  }, [open, q, data, build, node, ctx, objective])

  const buy = item ? cheapestBuy(item, ctx) : null
  const price = item ? (buy?.price ?? anyPrice(item, ctx)) : null

  return (
    <div style={{ marginLeft: depth * 18 }}>
      <div className={`panel px-2.5 py-1.5 flex items-center gap-2 ${!item && node.slot.required ? 'border-danger/50' : ''}`}>
        <div className="w-[120px] shrink-0">
          <div className="text-[11px] text-ink-3 truncate" title={node.slot.nameId}>{node.slot.name || node.slot.nameId}</div>
          {node.slot.required && !item && <div className="text-[10px] text-danger uppercase tracking-[.1em]">обязательно</div>}
        </div>
        {item ? (
          <>
            <ItemCell item={item} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink truncate">{item.name}</div>
              <div className="text-[11px] num flex items-center gap-2">
                <ModDelta label="эрго" v={item.mod?.ergonomics ?? 0} />
                <ModDelta label="отдача" v={Math.round((item.mod?.recoilModifier ?? 0) * 100)} pct invert />
                {item.mod?.capacity ? <span className="text-ink-3">{item.mod.capacity} патр.</span> : null}
                <span className="text-ink-3">{item.weight.toFixed(2)} кг</span>
              </div>
            </div>
            <span className="text-right">
              {buy?.source === 'trader' && <TraderMark id={buy.trader!} size={14} className="inline-block mr-1 align-middle" />}
              <Price value={price} dim={!buy} className={`text-[12px] ${!buy ? 'line-through decoration-danger/60' : ''}`} />
            </span>
          </>
        ) : (
          <div className="flex-1 text-[12px] text-ink-4">пусто</div>
        )}
        <button type="button" onClick={() => setOpen(!open)} className="chip hover:text-ink">{item ? 'Заменить' : 'Выбрать'}</button>
        {item && <button type="button" onClick={() => onChange(setSlot(data, build, node, null))} className="text-ink-4 hover:text-danger" title="Снять"><X size={14} /></button>}
      </div>

      {open && (
        <div className="panel mt-1 p-2 max-h-[340px] overflow-y-auto">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск модуля" className="input focus:input-focus h-8 w-full text-[12px] mb-1" />
          {options.length === 0 && <div className="text-[12px] text-ink-4 p-2">Нечего поставить (конфликты или пусто)</div>}
          {options.map(({ it, buy, price }) => (
            <button key={it.id} type="button" onClick={() => { onChange(setSlot(data, build, node, it.id)); setOpen(false); setQ('') }}
              className={`w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-bg-2 text-left ${it.id === node.item ? 'bg-bg-3' : ''}`}>
              <ItemCell item={it} size={28} onClick={() => { onChange(setSlot(data, build, node, it.id)); setOpen(false) }} />
              <span className="flex-1 min-w-0 truncate text-[12px] text-ink">{it.name}</span>
              <span className="num text-[11px] flex items-center gap-2">
                <ModDelta label="эрго" v={it.mod?.ergonomics ?? 0} />
                <ModDelta label="отд." v={Math.round((it.mod?.recoilModifier ?? 0) * 100)} pct invert />
                {it.slots?.length ? <span className="text-ink-4" title="Есть свои слоты">+{it.slots.length} сл.</span> : null}
              </span>
              <span className="w-20 text-right">
                {buy?.source === 'trader' && <TraderMark id={buy.trader!} size={12} className="inline-block mr-1 align-middle" />}
                <Price value={price} dim={!buy} className={`text-[11px] ${!buy ? 'line-through decoration-danger/60' : ''}`} />
              </span>
            </button>
          ))}
        </div>
      )}

      {item && node.children.map((c) => <SlotRow key={c.slot.id} node={c} build={build} depth={depth + 1} objective={objective} onChange={onChange} />)}
    </div>
  )
}

function ModDelta({ label, v, pct = false, invert = false }: { label: string; v: number; pct?: boolean; invert?: boolean }) {
  if (!v) return <span className="text-ink-4">{label} 0</span>
  const good = invert ? v < 0 : v > 0
  return <span className={good ? 'text-fir' : 'text-danger'}>{label} {v > 0 ? '+' : ''}{v}{pct ? '%' : ''}</span>
}

