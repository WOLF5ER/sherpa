import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, KeyRound, Skull, DoorOpen, TriangleAlert, Check } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import { computeNeeds, CURRENCY } from '@/lib/needs'
import { objectiveLabel } from '@/lib/tasks'
import { findMeta } from '@/data/mapMeta'
import { extractsOf, FACTION_RU } from '@/lib/extracts'
import type { Objective, GameMap, Task } from '@/data/types'
import { ItemCell } from '@/components/ItemCell'
import { useFreshPrices } from '@/lib/useFreshPrices'
import { Chip, Eyebrow, FirBadge, TraderMark, Toggle } from '@/components/ui'

const MAP_ORDER = ['customs', 'factory', 'woods', 'shoreline', 'interchange', 'reserve', 'lighthouse', 'streets-of-tarkov', 'ground-zero', 'the-lab', 'the-labyrinth', 'terminal', 'icebreaker', 'night-factory', 'ground-zero-21', 'the-lab-dark']

function taskTouchesMap(t: Task, mapId: string): boolean {
  return t.map === mapId || t.objectives.some((o) => o.maps.includes(mapId) || o.zones?.some((z) => z.map === mapId))
}

/** Брифинг: всё, что нужно знать за 30 секунд до рейда на выбранную карту. */
export function RaidPage() {
  const data = useGame()
  const views = useTaskViews()
  const faction = useProfile((s) => s.faction)
  const gameMode = useProfile((s) => s.gameMode)
  const stations = useProfile((s) => s.stations)
  const have = useProfile((s) => s.have)
  const kappaOnly = useProfile((s) => s.kappaOnly)
  const objectivesDone = useProfile((s) => s.objectivesDone)
  const toggleObjective = useProfile((s) => s.toggleObjective)
  const [includeLocked, setIncludeLocked] = useState(false)

  const maps = useMemo(() => Object.values(data.maps)
    .filter((m) => findMeta(m.normalizedName))
    .sort((a, b) => MAP_ORDER.indexOf(a.normalizedName) - MAP_ORDER.indexOf(b.normalizedName)), [data])
  const [mapId, setMapId] = useState(() => {
    try { return localStorage.getItem('sherpa:raidMap') || maps[0]?.id } catch { return maps[0]?.id }
  })
  const gmap: GameMap | undefined = data.maps[mapId]
  const pick = (id: string) => { setMapId(id); try { localStorage.setItem('sherpa:raidMap', id) } catch { /* ignore */ } }

  const tasks = useMemo(() => {
    if (!gmap) return []
    return [...views.values()]
      .filter((v) => v.status !== 'done' && (includeLocked || v.status === 'available'))
      .filter((v) => !kappaOnly || v.task.kappaRequired)
      .filter((v) => taskTouchesMap(v.task, gmap.id))
      .sort((a, b) => Number(b.status === 'available') - Number(a.status === 'available') || a.task.minPlayerLevel - b.task.minPlayerLevel)
  }, [views, gmap, includeLocked, kappaOnly])

  // пункт квеста «про эту карту»
  const onThisMap = (o: Objective) => o.maps.includes(gmap!.id) || !!o.zones?.some((z) => z.map === gmap!.id)
  const keys = useMemo(() => {
    if (!gmap) return []
    const set = new Map<string, { names: Set<string>; objIds: string[] }>()
    for (const v of tasks) {
      // все пункты квеста на этой карте уже отмечены — ключ больше не нужен
      const here = v.task.objectives.filter(onThisMap)
      if (here.length && here.every((o) => objectivesDone[o.id])) continue
      for (const nk of v.task.neededKeys) {
        if (nk.map && nk.map !== gmap.id) continue
        for (const k of nk.keys) {
          const e = set.get(k) ?? set.set(k, { names: new Set(), objIds: [] }).get(k)!
          e.names.add(v.task.name)
          for (const o of here) if (!objectivesDone[o.id]) e.objIds.push(o.id)
        }
      }
    }
    return [...set.entries()].map(([id, e]) => ({ item: data.items[id], names: [...e.names], objIds: e.objIds })).filter((k) => k.item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, gmap, data, objectivesDone])

  // предметы из общего списка «что нести», которые могут лежать на этой карте
  const findHere = useMemo(() => {
    if (!gmap) return []
    const needs = computeNeeds(data, views, stations, have, { includeLocked, allHideoutLevels: false, kappaOnly })
    const spots = new Map<string, number>()
    for (const l of gmap.lootLoose) for (const id of l.items) spots.set(id, (spots.get(id) ?? 0) + 1)
    return needs
      .filter((n) => !CURRENCY.has(n.item.id) && n.have < n.total && spots.has(n.item.id))
      .map((n) => ({ need: n, spots: spots.get(n.item.id)! }))
      .sort((a, b) => Number(b.need.nowTotal > 0) - Number(a.need.nowTotal > 0) || b.spots - a.spots)
      .slice(0, 24)
  }, [gmap, data, views, stations, have, includeLocked, kappaOnly])

  // предметы, которые надо принести С СОБОЙ (установить/передать на карте)
  const bring = useMemo(() => {
    const out = new Map<string, { item: string; count: number; tasks: Map<string, number>; objIds: string[] }>()
    for (const v of tasks) for (const o of v.task.objectives) {
      if (o.type !== 'plantItem' || !o.items?.length) continue
      if (objectivesDone[o.id]) continue // уже установлено — нести не надо
      if (!onThisMap(o) && v.task.map !== gmap!.id) continue
      const id = o.items[0]
      const e = out.get(id) ?? { item: id, count: 0, tasks: new Map<string, number>(), objIds: [] }
      e.count += o.count ?? 1
      e.objIds.push(o.id)
      e.tasks.set(v.task.name, (e.tasks.get(v.task.name) ?? 0) + (o.count ?? 1))
      out.set(id, e)
    }
    return [...out.values()].filter((b) => data.items[b.item]).map((b) => ({
      ...b, tasks: [...b.tasks.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, gmap, data, objectivesDone])

  const freshIds = useMemo(() => [
    ...keys.map((k) => k.item.id),
    ...bring.map((b) => b.item),
    ...findHere.map((f) => f.need.item.id),
  ], [keys, bring, findHere])
  useFreshPrices(freshIds, 60)

  if (!gmap) return null
  const allExtracts = extractsOf(data, gmap, gameMode)
  const extracts = allExtracts.filter((e) => e.faction !== 'scav')
  const scavExtracts = allExtracts.filter((e) => e.faction === 'scav')
  // предметы для выходов ЧВК (ракеты, записки, карты минных полей)
  // один и тот же предмет в двух вариантах (обычный/сезонный «Зелёный») — показываем раз, по короткому имени
  const extractItems = new Map<string, string[]>()
  const seenShort = new Map<string, string>()
  for (const e of extracts) for (const id of e.items) {
    const short = data.items[id]?.shortName ?? id
    const key = seenShort.get(short) ?? id
    seenShort.set(short, key)
    const arr = extractItems.get(key) ?? extractItems.set(key, []).get(key)!
    if (!arr.includes(e.label)) arr.push(e.label)
  }
  const hazardTypes = new Map<string, number>()
  for (const h of gmap.hazards) hazardTypes.set(h.name || h.hazardType, (hazardTypes.get(h.name || h.hazardType) ?? 0) + 1)

  return (
    <div className="p-5 max-w-[1100px] mx-auto flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Брифинг</h1>
          <div className="mt-1 text-[13px] text-ink-3">Что делать, что искать и что взять с собой — под одну карту и твой прогресс.</div>
        </div>
        <Toggle value={includeLocked} onChange={setIncludeLocked} label="Показывать квесты впереди" />
      </header>

      <div className="flex flex-wrap gap-1">
        {maps.map((m) => <Chip key={m.id} on={m.id === gmap.id} onClick={() => pick(m.id)}>{m.name}</Chip>)}
      </div>

      <section className="panel p-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="display text-[26px] text-ink">{gmap.name}</div>
        <div className="num text-[13px] text-ink-2">{gmap.raidDuration} мин · {gmap.players} игроков · {faction} · {gameMode === 'pve' ? 'PvE' : 'PvP'}</div>
        {gmap.bosses.length > 0 && (
          <div className="flex items-center gap-2 text-[13px] text-ink-2 flex-wrap">
            <Skull size={14} className="text-boss" />
            {gmap.bosses.map((b, i) => <span key={i}>{b.name} <span className="num text-ink-3">{Math.round(b.spawnChance * 100)}%</span></span>)}
          </div>
        )}
        <Link to={`/maps?map=${gmap.normalizedName}`} className="ml-auto chip hover:text-ink hover:border-ink-4"><MapPin size={12} /> Открыть карту</Link>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Квесты */}
        <section>
          <Eyebrow>Квесты на карте · {tasks.length}</Eyebrow>
          {tasks.length === 0 ? (
            <div className="mt-2 text-[13px] text-ink-3">Доступных квестов на этой карте нет. Проверь уровень в профиле или включи «квесты впереди».</div>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {tasks.map((v) => {
                const objs = v.task.objectives.filter((o) => !o.optional && (o.maps.includes(gmap.id) || o.zones?.some((z) => z.map === gmap.id) || (o.maps.length === 0 && v.task.map === gmap.id)))
                const hasZone = v.task.objectives.some((o) => o.zones?.some((z) => z.map === gmap.id))
                return (
                  <li key={v.task.id} className={`panel px-3 py-2 ${v.status === 'locked' ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2">
                      <TraderMark id={v.task.trader} size={22} />
                      <Link to={`/tasks?q=${encodeURIComponent(v.task.name)}`} className={`display text-[16px] hover:text-brass-2 truncate ${v.task.seasonal ? 'text-season' : 'text-ink'}`}>{v.task.name}</Link>
                      {v.task.kappaRequired && <span className="display text-[10px] text-brass border border-brass-3 rounded-[3px] px-1 leading-[14px]">К</span>}
                      {v.status === 'locked' && <span className="eyebrow">{v.task.minPlayerLevel} ур.</span>}
                      {hasZone && <Link to={`/maps?map=${gmap.normalizedName}&task=${v.task.id}`} className="ml-auto text-ink-3 hover:text-brass-2" title="Показать зоны на карте"><MapPin size={14} /></Link>}
                    </div>
                    <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-ink-2">
                      {objs.map((o) => {
                        const it = o.items?.[0] ? data.items[o.items[0]] : null
                        return (
                          <li key={o.id} className="flex items-start gap-2">
                            <span className="eyebrow mt-[3px] w-[76px] shrink-0 text-right">{objectiveLabel(o.type)}</span>
                            {it && <ItemCell item={it} size={24} count={o.count} fir={o.foundInRaid} />}
                            <span className="flex-1">{o.description}{o.foundInRaid && <FirBadge className="ml-2" />}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-5">
          {/* Взять с собой */}
          <section>
            <Eyebrow>Взять с собой</Eyebrow>
            {keys.length === 0 && bring.length === 0 && extractItems.size === 0 ? (
              <div className="mt-2 text-[13px] text-ink-3">Ничего особенного</div>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {keys.map((k) => (
                  <li key={k.item.id} className="panel px-2 py-1.5 flex items-center gap-2">
                    <ItemCell item={k.item} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-ink truncate flex items-center gap-1"><KeyRound size={11} className="text-key shrink-0" style={{ color: '#d4a247' }} />{k.item.shortName}</div>
                      <div className="text-[11px] text-ink-3 truncate">{k.names.join(', ')}</div>
                    </div>
                    <Link to={`/maps?map=${gmap.normalizedName}&key=${k.item.id}`} className="text-ink-3 hover:text-brass-2" title="Какую дверь открывает"><MapPin size={13} /></Link>
                    {k.objIds.length > 0 && (
                      <button type="button" onClick={() => k.objIds.forEach((id) => toggleObjective(id, true))} className="text-ink-3 hover:text-fir" title="Уже был — отметить пункты квеста на этой карте выполненными"><Check size={14} /></button>
                    )}
                  </li>
                ))}
                {[...extractItems.entries()].map(([id, names]) => data.items[id] && (
                  <li key={`ex-${id}`} className="panel px-2 py-1.5 flex items-center gap-2">
                    <ItemCell item={data.items[id]} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-ink truncate">{data.items[id].shortName}</div>
                      <div className="text-[11px] text-ink-3 truncate">выход: {names.join(', ')}</div>
                    </div>
                  </li>
                ))}
                {bring.map((b) => (
                  <li key={b.item} className="panel px-2 py-1.5 flex items-center gap-2">
                    <ItemCell item={data.items[b.item]} size={30} count={b.count} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-ink truncate">{data.items[b.item].shortName} <span className="num text-ink-3">×{b.count}</span></div>
                      <div className="text-[11px] text-ink-3 truncate">установить: {b.tasks.join(', ')}</div>
                    </div>
                    <button type="button" onClick={() => b.objIds.forEach((id) => toggleObjective(id, true))} className="text-ink-3 hover:text-fir" title="Установил — отметить пункты выполненными"><Check size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Искать здесь */}
          <section>
            <Eyebrow>Может лежать здесь</Eyebrow>
            <div className="mt-1 text-[11px] text-ink-3">Из списка «что нести» — предметы с точками россыпного лута на этой карте</div>
            {findHere.length === 0 ? (
              <div className="mt-2 text-[13px] text-ink-3">Ничего из нужного тут не спавнится россыпью</div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {findHere.map(({ need, spots }) => (
                  <Link key={need.item.id} to={`/maps?map=${gmap.normalizedName}&item=${need.item.id}`} className="relative" title={`${need.item.name} — нужно ещё ${need.total - need.have}, точек: ${spots}`}>
                    <ItemCell item={need.item} size={40} count={need.total - need.have} fir={need.questFir + need.hideoutFir > 0} static className={need.nowTotal === 0 ? 'opacity-60' : ''} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Выходы */}
          <section>
            <Eyebrow>Выходы ЧВК</Eyebrow>
            <ul className="mt-2 flex flex-col gap-1 text-[13px]">
              {extracts.map((e) => (
                <li key={e.id} className="flex items-start gap-2" title={e.note ?? undefined}>
                  <DoorOpen size={13} className="mt-[3px] shrink-0" style={{ color: e.faction === 'shared' ? 'var(--color-fir)' : e.faction === 'pmc' ? 'var(--color-pmc)' : 'var(--color-ink-3)' }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-ink-2">{e.label}</span>
                      {e.faction === 'shared' && <span className="eyebrow">общий</span>}
                      {e.faction === 'unknown' && <span className="eyebrow">{FACTION_RU.unknown}</span>}
                      {e.notAlways && <span className="eyebrow">не всегда</span>}
                      {e.single && <span className="eyebrow">одноразовый</span>}
                      {e.missing && <span className="eyebrow text-ink-4" title="Есть в вики, но нет координат в данных tarkov.dev">нет на карте</span>}
                    </div>
                    {e.req && <div className="text-[12px] text-brass-2/90 leading-4">{e.req}</div>}
                    {e.note && <div className="text-[11px] text-ink-3 leading-4">{e.note}</div>}
                  </div>
                </li>
              ))}
              {scavExtracts.length > 0 && <li className="mt-1 text-[11px] text-ink-4">+ {scavExtracts.length} выходов для диких</li>}
            </ul>
            <div className="mt-2 text-[11px] text-ink-4">Условия сверены с вики; транзиты открываются через минуту после начала рейда.</div>
          </section>

          {hazardTypes.size > 0 && (
            <section>
              <Eyebrow>Опасности</Eyebrow>
              <ul className="mt-2 flex flex-col gap-0.5 text-[13px]">
                {[...hazardTypes.entries()].map(([name, n]) => (
                  <li key={name} className="flex items-center gap-2 text-ink-2"><TriangleAlert size={13} className="text-danger" />{name} <span className="num text-ink-3">×{n}</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
