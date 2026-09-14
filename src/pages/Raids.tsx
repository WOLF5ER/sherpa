import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Map as MapIcon, Trash2, Footprints, Clock, Route, DoorOpen, Skull, Heart, Wind } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useRaids, GAP_MS, OUTCOME_LABEL, type Outcome, type RaidSummary, type RaidPoint } from '@/store/raids'
import { extractsOf } from '@/lib/extracts'
import { findMeta } from '@/data/mapMeta'
import { plural } from '@/lib/format'
import type { GameData, GameMap } from '@/data/types'
import type { GameMode } from '@/data/loader'
import { Chip, Empty, Eyebrow, Segmented, Toggle } from '@/components/ui'

const OUTCOMES: { id: Outcome; icon: typeof Heart; cls: string }[] = [
  { id: 'survived', icon: Heart, cls: 'text-fir border-fir/60 bg-fir/10' },
  { id: 'died', icon: Skull, cls: 'text-danger border-danger/60 bg-danger/10' },
  { id: 'runner', icon: Wind, cls: 'text-scav border-scav/60 bg-scav/10' },
]

/** ближе этого до выхода — считаем, что рейд закончился у него */
const EXTRACT_RADIUS = 35

function nearExtract(data: GameData, map: GameMap, p: RaidPoint, mode: GameMode): string | null {
  let best: { label: string; d: number } | null = null
  for (const x of extractsOf(data, map, mode)) {
    if (!x.extract) continue
    const e = x.extract
    const d = Math.hypot(e.position.x - p.x, e.position.z - p.z)
    if (d <= EXTRACT_RADIUS && (!best || d < best.d)) best = { label: x.label, d }
  }
  for (const t of map.transits) {
    const d = Math.hypot(t.position.x - p.x, t.position.z - p.z)
    if (d <= EXTRACT_RADIUS && (!best || d < best.d)) best = { label: `переход → ${t.map ? data.maps[t.map]?.name ?? '' : ''}`, d }
  }
  return best?.label ?? null
}

const fmtDur = (ms: number) => {
  const m = Math.round(ms / 60000)
  return m < 1 ? '< 1 мин' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`
}
const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} км` : `${Math.round(m)} м`)
const fmtDate = (ts: number) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function RaidsPage() {
  const data = useGame()
  const gameMode = useProfile((s) => s.gameMode)
  const list = useRaids((s) => s.list)
  const current = useRaids((s) => s.current)
  const setOutcome = useRaids((s) => s.setOutcome)
  const setNote = useRaids((s) => s.setNote)
  const setMap = useRaids((s) => s.setMap)
  const remove = useRaids((s) => s.remove)
  const removeMany = useRaids((s) => s.removeMany)
  const [mapFilter, setMapFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | Outcome>('all')
  const [hideSingles, setHideSingles] = useState(true)

  const maps = useMemo(() => Object.values(data.maps).filter((m) => findMeta(m.normalizedName)).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [data])
  const now = Date.now()
  const live = current && now - current.end < GAP_MS ? current.id : null

  const singles = useMemo(() => list.filter((r) => r.n < 2 && r.id !== live), [list, live])
  const shown = useMemo(() => {
    let l = list
    if (hideSingles) l = l.filter((r) => r.n >= 2 || r.id === live)
    if (mapFilter) l = l.filter((r) => r.mapId === mapFilter)
    if (outcomeFilter !== 'all') l = l.filter((r) => r.outcome === outcomeFilter)
    return l
  }, [list, hideSingles, mapFilter, outcomeFilter, live])

  // статистика — по «настоящим» рейдам (2+ точки), с учётом фильтра по карте
  const stats = useMemo(() => {
    const real = list.filter((r) => r.n >= 2 && (!mapFilter || r.mapId === mapFilter))
    const withOutcome = real.filter((r) => r.outcome)
    const survived = withOutcome.filter((r) => r.outcome === 'survived').length
    const durations = real.map((r) => r.end - r.start).filter((d) => d >= 60_000)
    const byMap = new Map<string, { n: number; survived: number; outcomes: number; dur: number; durN: number; dist: number }>()
    for (const r of real) {
      const e = byMap.get(r.mapId) ?? byMap.set(r.mapId, { n: 0, survived: 0, outcomes: 0, dur: 0, durN: 0, dist: 0 }).get(r.mapId)!
      e.n++
      if (r.outcome) { e.outcomes++; if (r.outcome === 'survived') e.survived++ }
      if (r.end - r.start >= 60_000) { e.dur += r.end - r.start; e.durN++ }
      e.dist += r.dist
    }
    return {
      n: real.length,
      survival: withOutcome.length ? survived / withOutcome.length : null,
      outcomes: withOutcome.length,
      avgDur: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      dist: real.reduce((a, r) => a + r.dist, 0),
      byMap: [...byMap.entries()].sort((a, b) => b[1].n - a[1].n),
    }
  }, [list, mapFilter])

  return (
    <div className="p-5 max-w-[1100px] mx-auto flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Рейды</h1>
          <div className="mt-1 text-[13px] text-ink-3">
            След «ты здесь» сохраняется по рейдам: карта, время, путь. Новый рейд начинается сам — после паузы в {GAP_MS / 60000} минут, при смене карты или по «Сбросить след». Исход отметь руками.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={mapFilter} onChange={(e) => setMapFilter(e.target.value)} className="input focus:input-focus w-44">
            <option value="">Все карты</option>
            {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <Segmented value={outcomeFilter} onChange={setOutcomeFilter} options={[{ value: 'all', label: 'Все' }, { value: 'survived', label: 'Выжил' }, { value: 'died', label: 'Погиб' }, { value: 'runner', label: 'Сбежал' }]} />
        </div>
      </header>

      {stats.n > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Footprints} label="Рейдов" value={String(stats.n)} hint={stats.outcomes < stats.n ? `исход отмечен у ${stats.outcomes}` : undefined} />
          <Stat icon={Heart} label="Выживаемость" value={stats.survival == null ? '—' : `${Math.round(stats.survival * 100)} %`} hint={stats.survival == null ? 'отметь исходы рейдов' : `из ${stats.outcomes} с отметкой`} />
          <Stat icon={Clock} label="Средний рейд" value={stats.avgDur == null ? '—' : fmtDur(stats.avgDur)} hint="от первого до последнего скриншота" />
          <Stat icon={Route} label="Пройдено" value={fmtDist(stats.dist)} hint="по прямой между скриншотами — реально больше" />
        </section>
      )}

      {stats.byMap.length > 1 && !mapFilter && (
        <section className="panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line">
              <tr>
                <th className="py-2 px-3 text-left"><span className="eyebrow">Карта</span></th>
                <th className="py-2 px-3 text-right"><span className="eyebrow">Рейдов</span></th>
                <th className="py-2 px-3 text-right"><span className="eyebrow">Выжил</span></th>
                <th className="py-2 px-3 text-right"><span className="eyebrow">Средний</span></th>
                <th className="py-2 px-3 text-right"><span className="eyebrow">Пройдено</span></th>
              </tr>
            </thead>
            <tbody>
              {stats.byMap.map(([mapId, e]) => (
                <tr key={mapId || '?'} className="border-b border-line/60 hover:bg-bg-2/60">
                  <td className="py-1.5 px-3">
                    <button type="button" onClick={() => setMapFilter(mapId)} className="text-ink hover:text-brass-2">{data.maps[mapId]?.name ?? 'Карта не указана'}</button>
                  </td>
                  <td className="py-1.5 px-3 text-right num">{e.n}</td>
                  <td className="py-1.5 px-3 text-right num">{e.outcomes ? `${Math.round(e.survived / e.outcomes * 100)} %` : '—'}</td>
                  <td className="py-1.5 px-3 text-right num">{e.durN ? fmtDur(e.dur / e.durN) : '—'}</td>
                  <td className="py-1.5 px-3 text-right num">{fmtDist(e.dist)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Toggle value={hideSingles} onChange={setHideSingles} label={`Скрыть рейды из одного скриншота${singles.length ? ` (${singles.length})` : ''}`} />
        {singles.length > 0 && (
          <button type="button" onClick={() => { if (confirm(`Удалить ${singles.length} ${plural(singles.length, 'запись', 'записи', 'записей')} из одной точки? Обычно это скриншоты в схроне или меню.`)) removeMany(singles.map((r) => r.id)) }} className="chip hover:text-danger hover:border-danger/60">
            <Trash2 size={12} /> Удалить одиночные
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <Empty title="Рейдов пока нет" hint="Включи «Следить за скриншотами» на карте и жми клавишу скриншота в рейде — путь запишется сюда сам." >
          <Link to="/maps" className="chip chip-on"><MapIcon size={12} /> Открыть карту</Link>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <RaidRow key={r.id} r={r} live={r.id === live} data={data} maps={maps} mode={gameMode}
              onOutcome={(o) => setOutcome(r.id, o)} onNote={(n) => setNote(r.id, n)} onMap={(m) => setMap(r.id, m)}
              onRemove={() => { if (confirm('Удалить этот рейд из истории?')) remove(r.id) }} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Heart; label: string; value: string; hint?: string }) {
  return (
    <div className="panel px-4 py-3 flex items-center gap-3">
      <Icon size={18} className="text-brass shrink-0" />
      <div className="min-w-0">
        <Eyebrow>{label}</Eyebrow>
        <div className="num text-[20px] text-ink leading-tight">{value}</div>
        {hint && <div className="text-[11px] text-ink-4 truncate">{hint}</div>}
      </div>
    </div>
  )
}

function RaidRow({ r, live, data, maps, mode, onOutcome, onNote, onMap, onRemove }: {
  r: RaidSummary; live: boolean; data: GameData; maps: GameMap[]; mode: GameMode
  onOutcome: (o: Outcome | null) => void; onNote: (n: string) => void; onMap: (m: string) => void; onRemove: () => void
}) {
  const map = data.maps[r.mapId]
  const extract = map && r.last && r.n >= 2 ? nearExtract(data, map, r.last, mode) : null
  const [noteEdit, setNoteEdit] = useState<string | null>(null)
  const dur = r.end - r.start
  return (
    <li className={`panel px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 ${live ? 'border-brass-3' : ''}`}>
      <div className="w-[120px] shrink-0">
        <div className="num text-[13px] text-ink">{fmtDate(r.start)}</div>
        <div className="text-[11px] text-ink-4">{live ? <span className="text-brass-2">идёт сейчас</span> : dur >= 60_000 ? fmtDur(dur) : 'меньше минуты'}</div>
      </div>
      <div className="w-[160px] shrink-0">
        {map ? (
          <select value={r.mapId} onChange={(e) => onMap(e.target.value)} className="input focus:input-focus h-8 w-full text-[13px]" title="Карта рейда — можно поправить">
            {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ) : (
          <select value="" onChange={(e) => e.target.value && onMap(e.target.value)} className="input focus:input-focus h-8 w-full text-[13px] border-scav/60 text-scav" title="Карта неизвестна: во время рейда карта в приложении не была открыта">
            <option value="">Какая карта?</option>
            {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>
      <div className="flex items-center gap-3 text-[12px] text-ink-3 num shrink-0">
        <span className="inline-flex items-center gap-1" title="Пройдено по прямой между скриншотами"><Route size={12} />{fmtDist(r.dist)}</span>
        <span className="inline-flex items-center gap-1" title="Скриншотов"><Footprints size={12} />{r.n}</span>
      </div>
      {extract && (
        <span className="inline-flex items-center gap-1 text-[12px] text-fir" title="Последний скриншот рядом с выходом"><DoorOpen size={12} />{extract}</span>
      )}
      <div className="flex gap-1 ml-auto">
        {OUTCOMES.map(({ id, icon: Icon, cls }) => (
          <button key={id} type="button" onClick={() => onOutcome(r.outcome === id ? null : id)} title={OUTCOME_LABEL[id]}
            className={`h-7 px-2 inline-flex items-center gap-1 rounded-[4px] border text-[11px] font-display uppercase tracking-[.08em] transition-colors ${r.outcome === id ? cls : 'border-line-2 text-ink-4 hover:text-ink-2 hover:border-ink-4'}`}>
            <Icon size={12} />{r.outcome === id && OUTCOME_LABEL[id]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {map && r.n >= 2 && (
          <Link to={`/maps?map=${map.normalizedName}&raid=${r.id}`} className="chip chip-on" title="Повторить путь на карте"><MapIcon size={12} /> На карте</Link>
        )}
        <button type="button" onClick={onRemove} className="p-1.5 text-ink-4 hover:text-danger" title="Удалить"><Trash2 size={14} /></button>
      </div>
      <div className="basis-full">
        {noteEdit == null ? (
          <button type="button" onClick={() => setNoteEdit(r.note)} className={`text-left text-[12px] ${r.note ? 'text-ink-2' : 'text-ink-4'} hover:text-ink`}>{r.note || 'заметка…'}</button>
        ) : (
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); onNote(noteEdit.trim()); setNoteEdit(null) }}>
            <input autoFocus value={noteEdit} onChange={(e) => setNoteEdit(e.target.value)} placeholder="Что было: лут, кто убил, чему научился" className="input focus:input-focus h-7 text-[12px] flex-1" />
            <button type="submit" className="chip chip-on">Ок</button>
            <Chip onClick={() => setNoteEdit(null)}>Отмена</Chip>
          </form>
        )}
      </div>
    </li>
  )
}
