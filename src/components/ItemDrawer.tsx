import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { X, ExternalLink, MapPin, KeyRound, Star } from 'lucide-react'
import { useWatch } from '@/store/watch'
import { useGame } from '@/store/data'
import { useUI } from '@/store/ui'
import { useProfile } from '@/store/profile'
import { usePriceCtx, useTaskViews } from '@/lib/useCtx'
import { bestSell, fleaSell, isFleaAllowed, fleaPrice, perSlot } from '@/lib/flea'
import { itemUsageIndex } from '@/lib/indexes'
import { useFreshPrices } from '@/lib/useFreshPrices'
import { rub, duration } from '@/lib/format'
import { ItemCell } from './ItemCell'
import { Price, Delta, TraderMark, Eyebrow, FirBadge, Stepper } from './ui'

export function ItemDrawer() {
  const id = useUI((s) => s.itemId)
  const close = useUI((s) => s.closeItem)
  if (!id) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={close} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-[440px] max-w-full panel rounded-none border-y-0 border-r-0 overflow-y-auto shadow-[var(--shadow-pop)]">
        <ItemDetail id={id} onClose={close} />
      </aside>
    </>
  )
}

function ItemDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useGame()
  const ctx = usePriceCtx()
  const views = useTaskViews()
  const have = useProfile((s) => s.have[id] ?? 0)
  const setHave = useProfile((s) => s.setHave)
  const stationsLvl = useProfile((s) => s.stations)
  const item = data.items[id]
  const usage = useMemo(() => itemUsageIndex(data).get(id), [data, id])
  const watched = useWatch((s) => !!s.items[id])
  const toggleWatch = useWatch((s) => s.toggle)
  useFreshPrices([id])

  if (!item) return <div className="p-6 text-ink-3">Предмет не найден</div>

  const best = bestSell(data, item, ctx)
  const flea = fleaSell(data, item, ctx)
  const fleaOk = isFleaAllowed(item, ctx.level, ctx.fleaMinLevel)
  const fp = fleaPrice(item)
  const traders = [...item.sellToTrader].sort((a, b) => b.priceRUB - a.priceRUB)
  const slots = item.width * item.height

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-start gap-3 p-4 bg-bg-1/95 backdrop-blur border-b border-line">
        <ItemCell item={item} size={64} static />
        <div className="min-w-0 flex-1">
          <div className="display text-[20px] leading-[1.05] text-ink">{item.name}</div>
          {item.nameEn && item.nameEn !== item.name && <div className="mt-0.5 text-[12px] text-ink-3">{item.nameEn}</div>}
          <div className="mt-1 text-[12px] text-ink-3 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{item.shortName}</span>
            <span className="num">{item.width}×{item.height} · {slots} {slots === 1 ? 'слот' : slots < 5 ? 'слота' : 'слотов'}</span>
            <span className="num">{item.weight.toFixed(2)} кг</span>
          </div>
          <div className="mt-2 flex gap-2 text-[12px]">
            <a href={item.wikiLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-3 hover:text-brass-2">Вики <ExternalLink size={11} /></a>
            <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-3 hover:text-brass-2">tarkov.dev <ExternalLink size={11} /></a>
            <Link to={`/maps?item=${item.id}`} onClick={onClose} className="inline-flex items-center gap-1 text-ink-3 hover:text-brass-2"><MapPin size={11} /> Где лежит</Link>
            <button type="button" onClick={() => toggleWatch(item.id)} className={`inline-flex items-center gap-1 ${watched ? 'text-brass' : 'text-ink-3 hover:text-brass-2'}`}><Star size={11} fill={watched ? 'currentColor' : 'none'} /> {watched ? 'Слежу' : 'Следить'}</button>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-ink-3 hover:text-ink" aria-label="Закрыть"><X size={18} /></button>
      </div>

      <div className="p-4 flex flex-col gap-6">
        {/* Продажа */}
        <section>
          <Eyebrow>Продать выгоднее</Eyebrow>
          {best ? (
            <div className="mt-2 panel p-3 border-brass-3/60 bg-brass/5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  {best.source === 'trader' && best.trader && <TraderMark id={best.trader} size={22} />}
                  <span className="display text-[16px]">{best.source === 'flea' ? 'Барахолка' : data.traders[best.trader!]?.name}</span>
                </div>
                <Price value={best.net} className="text-[18px] text-brass-2" />
              </div>
              {best.source === 'flea' && (
                <div className="mt-1 text-[12px] text-ink-3 num">
                  {rub(best.gross)} − комиссия {rub(best.fee)}{ctx.intelDiscount ? ' (−30% разведцентр)' : ''}
                </div>
              )}
              <div className="mt-1 text-[12px] text-ink-3 num">{rub(perSlot(best.net, item))} за слот</div>
            </div>
          ) : (
            <div className="mt-2 text-ink-3 text-[13px]">Никто не покупает</div>
          )}

          <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
            <div className="text-ink-2 flex items-center gap-2">
              Барахолка · минимальная на последнем скане
              {!fleaOk && <span className="text-[10px] uppercase tracking-[.1em] text-ink-4">{item.types.includes('noFlea') ? 'запрещено' : ctx.fleaMinLevel === Infinity ? 'отключена' : `с ${Math.max(ctx.fleaMinLevel, item.minLevelForFlea ?? 0)} ур.`}</span>}
            </div>
            <div className="text-right flex items-center justify-end gap-2">
              <Delta value={item.changeLast48hPercent} />
              <Price value={fp} dim={!fleaOk} />
            </div>
            {(item.priceFresh || item.priceScanAt || data.priceAggregateStale) && (
              <div className="col-span-2 text-[11px] text-ink-4 num">
                {item.priceFresh
                  ? `цена по истории от ${new Date(item.priceFresh).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                  : data.priceAggregateStale
                    ? `сводка tarkov.dev от ${new Date(data.priceScanAt).toLocaleDateString('ru-RU')} — обновляю…`
                    : `скан барахолки ${new Date(item.priceScanAt!).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
              </div>
            )}
            {flea && (
              <>
                <div className="text-ink-3 pl-3">на руки после комиссии</div>
                <Price value={flea.net} className="text-right" dim />
              </>
            )}
            {item.avg24hPrice != null && (
              <>
                <div className="text-ink-3 pl-3">средняя за 24 ч</div>
                <Price value={item.avg24hPrice} className="text-right" dim />
              </>
            )}
            {traders.map((p) => (
              <div key={p.trader} className="contents">
                <div className="text-ink-2 flex items-center gap-2"><TraderMark id={p.trader} size={16} />{data.traders[p.trader]?.name}</div>
                <Price value={p.priceRUB} className="text-right" dim={best?.trader !== p.trader} />
              </div>
            ))}
          </div>
        </section>

        {/* Нужен для */}
        {(usage?.tasks.length || usage?.hideout.length) ? (
          <section>
            <div className="flex items-center justify-between">
              <Eyebrow>Нужен для</Eyebrow>
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                есть
                <Stepper value={have} onChange={(v) => setHave(item.id, v)} />
              </div>
            </div>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {usage.tasks.map((u) => {
                const v = views.get(u.task)
                const t = data.tasks[u.task]
                if (!t) return null
                const done = v?.status === 'done'
                return (
                  <li key={u.task} className={`py-2 flex items-center gap-2 text-[13px] ${done ? 'opacity-40' : ''}`}>
                    <TraderMark id={t.trader} size={18} />
                    <Link to={`/tasks?q=${encodeURIComponent(t.name)}`} onClick={onClose} className="flex-1 min-w-0 truncate hover:text-brass-2">{t.name}</Link>
                    {u.fir && <FirBadge />}
                    <span className="num text-ink-2">×{u.count}</span>
                    <span className={`text-[10px] uppercase tracking-[.1em] ${v?.status === 'available' ? 'text-fir' : v?.status === 'done' ? 'text-ink-4' : 'text-ink-4'}`}>
                      {v?.status === 'available' ? 'доступен' : v?.status === 'done' ? 'выполнен' : `${t.minPlayerLevel} ур.`}
                    </span>
                  </li>
                )
              })}
              {usage.hideout.map((u) => {
                const st = data.stations[u.station]
                const done = (stationsLvl[u.station] ?? 0) >= u.level
                return (
                  <li key={`${u.station}-${u.level}`} className={`py-2 flex items-center gap-2 text-[13px] ${done ? 'opacity-40' : ''}`}>
                    <img src={st?.imageLink} alt="" className="w-[18px] h-[18px] object-contain opacity-80" />
                    <span className="flex-1 min-w-0 truncate">{st?.name} · <span className="text-ink-3">уровень {u.level}</span></span>
                    {u.fir && <FirBadge />}
                    <span className="num text-ink-2">×{u.count}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {/* Где взять */}
        <section>
          <Eyebrow>Где взять</Eyebrow>
          <ul className="mt-2 flex flex-col divide-y divide-line text-[13px]">
            {item.buyFromTrader.map((p, i) => (
              <li key={i} className="py-2 flex items-center gap-2">
                <TraderMark id={p.trader} size={18} />
                <span className="flex-1">{data.traders[p.trader]?.name} <span className="text-ink-3">ур. {p.minTraderLevel ?? 1}</span></span>
                {p.taskUnlock && <span className="text-[10px] uppercase tracking-[.1em] text-ink-4" title={data.tasks[p.taskUnlock]?.name}>после квеста</span>}
                <Price value={p.priceRUB} />
              </li>
            ))}
            {usage?.bartersOut.map((b) => (
              <li key={b.id} className="py-2 flex items-center gap-2">
                <TraderMark id={b.trader} size={18} />
                <span className="text-ink-3 shrink-0">ур. {b.level} · обмен</span>
                <div className="flex-1 flex flex-wrap gap-1 justify-end">
                  {b.requiredItems.map((r) => data.items[r.item] && <ItemCell key={r.item} item={data.items[r.item]} size={30} count={r.count} />)}
                </div>
              </li>
            ))}
            {usage?.craftsOut.map((c) => (
              <li key={c.id} className="py-2 flex items-center gap-2">
                <img src={data.stations[c.station]?.imageLink} alt="" className="w-[18px] h-[18px] object-contain opacity-80" />
                <span className="text-ink-3 shrink-0">{data.stations[c.station]?.name} {c.level} · {duration(c.duration)}</span>
                <div className="flex-1 flex flex-wrap gap-1 justify-end">
                  {c.requiredItems.map((r) => data.items[r.item] && (
                    <ItemCell key={r.item} item={data.items[r.item]} size={30} count={r.count} className={r.tool ? 'opacity-60' : ''} title={r.tool ? `${data.items[r.item].name} (инструмент, не расходуется)` : undefined} />
                  ))}
                </div>
              </li>
            ))}
            {!item.buyFromTrader.length && !usage?.bartersOut.length && !usage?.craftsOut.length && (
              <li className="py-2 text-ink-3">Только в рейде</li>
            )}
          </ul>
        </section>

        {item.keyMaps?.length ? (
          <section>
            <Eyebrow>Открывает двери</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.keyMaps.map((m) => (
                <Link key={m} to={`/maps?map=${data.maps[m]?.normalizedName}&key=${item.id}`} onClick={onClose} className="chip hover:text-ink hover:border-ink-4">
                  <KeyRound size={12} /> {data.maps[m]?.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {usage?.rewardOf.length ? (
          <section>
            <Eyebrow>Награда за квест</Eyebrow>
            <div className="mt-2 flex flex-col gap-1 text-[13px]">
              {usage.rewardOf.map((t) => data.tasks[t] && (
                <div key={t} className="flex items-center gap-2"><TraderMark id={data.tasks[t].trader} size={16} />{data.tasks[t].name}</div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
