import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Search } from 'lucide-react'
import { useGame } from '@/store/data'
import { usePriceCtx } from '@/lib/useCtx'
import { cheapestBuy, anyPrice } from '@/lib/flea'
import { caliberName, penClass } from '@/lib/caliber'
import { search } from '@/lib/search'
import type { Item } from '@/data/types'
import { ItemCell } from '@/components/ItemCell'
import { Chip, Empty, Price, Segmented, TraderMark } from '@/components/ui'

type Tab = 'ammo' | 'armor'
type AmmoSort = 'pen' | 'dmg' | 'armorDmg' | 'frag' | 'speed' | 'price'
type ArmorSort = 'class' | 'durability' | 'price' | 'ergo' | 'speed'
type ArmorKind = 'all' | 'armor' | 'helmet' | 'rig' | 'attachment'

/** Цвет пробития: серый → зелёный по классу брони, который патрон пробивает. */
const PEN_COLORS = ['#767466', '#8a8a5a', '#9aa34a', '#a9b83a', '#8fc25a', '#6fc262', '#4fd07a']

export function AmmoPage() {
  const data = useGame()
  const ctx = usePriceCtx()
  const [tab, setTab] = useState<Tab>('ammo')
  const [q, setQ] = useState('')
  const [caliber, setCaliber] = useState<string | null>(null)
  const [ammoSort, setAmmoSort] = useState<AmmoSort>('pen')
  const [armorKind, setArmorKind] = useState<ArmorKind>('armor')
  const [armorSort, setArmorSort] = useState<ArmorSort>('class')
  const [desc, setDesc] = useState(true)
  const [onlyMine, setOnlyMine] = useState(false)

  const ammo = useMemo(() => Object.values(data.items).filter((i) => i.ammo && !i.types.includes('ammoBox')), [data])
  const armor = useMemo(() => Object.values(data.items).filter((i) => i.armor), [data])

  const calibers = useMemo(() => {
    const c = new Map<string, number>()
    for (const a of ammo) c.set(a.ammo!.caliber, (c.get(a.ammo!.caliber) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }, [ammo])

  const priceOf = (i: Item) => cheapestBuy(i, ctx)?.price ?? anyPrice(i, ctx)

  const ammoList = useMemo(() => {
    let l = ammo
    if (caliber) l = l.filter((i) => i.ammo!.caliber === caliber)
    if (onlyMine) l = l.filter((i) => cheapestBuy(i, ctx))
    if (q.trim()) { const ids = new Set(search(q, l, 300).map((i) => i.id)); l = l.filter((i) => ids.has(i.id)) }
    const key = (i: Item): number => {
      const a = i.ammo!
      switch (ammoSort) {
        case 'pen': return a.penetrationPower
        case 'dmg': return a.damage * a.projectileCount
        case 'armorDmg': return a.armorDamage
        case 'frag': return a.fragmentationChance
        case 'speed': return a.initialSpeed
        case 'price': return priceOf(i) ?? -1
      }
    }
    const dir = desc ? -1 : 1
    return [...l].sort((a, b) => (key(a) - key(b)) * dir || a.name.localeCompare(b.name, 'ru'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ammo, caliber, onlyMine, q, ammoSort, desc, ctx])

  const armorList = useMemo(() => {
    let l = armor
    if (armorKind !== 'all') l = l.filter((i) => i.armor!.kind === armorKind)
    if (onlyMine) l = l.filter((i) => cheapestBuy(i, ctx))
    if (q.trim()) { const ids = new Set(search(q, l, 300).map((i) => i.id)); l = l.filter((i) => ids.has(i.id)) }
    const key = (i: Item): number => {
      const a = i.armor!
      switch (armorSort) {
        case 'class': return a.class
        case 'durability': return a.durability
        case 'price': return priceOf(i) ?? -1
        case 'ergo': return a.ergoPenalty
        case 'speed': return a.speedPenalty
      }
    }
    const dir = desc ? -1 : 1
    return [...l].sort((a, b) => (key(a) - key(b)) * dir || a.name.localeCompare(b.name, 'ru'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armor, armorKind, onlyMine, q, armorSort, desc, ctx])

  const sortBtn = <T extends string>(cur: T, set: (v: T) => void, k: T, label: string, right = true) => (
    <th className={`py-2 px-2 ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => { if (cur === k) setDesc(!desc); else { set(k); setDesc(true) } }}
        className={`eyebrow inline-flex items-center gap-1 hover:text-ink ${cur === k ? 'text-brass' : ''}`}>
        {label}{cur === k && (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  )

  return (
    <div className="p-5 max-w-[1200px] mx-auto flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">{tab === 'ammo' ? 'Патроны' : 'Броня'}</h1>
          <div className="mt-1 text-[13px] text-ink-3">
            {tab === 'ammo'
              ? 'Пробитие сравнивай с классом брони: ≈ класс × 10 — пробивает уверенно. Цвет пробития — какой класс патрон берёт.'
              : 'Штрафы — к скорости, повороту и эргономике. Новая броня с плитами: класс зависит от вставленных плит.'}
          </div>
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'ammo', label: 'Патроны' }, { value: 'armor', label: 'Броня' }]} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название" className="input focus:input-focus pl-8 w-52" />
        </label>
        {tab === 'armor' && (
          <Segmented value={armorKind} onChange={setArmorKind} options={[
            { value: 'armor', label: 'Бронежилеты' }, { value: 'helmet', label: 'Шлемы' }, { value: 'rig', label: 'Разгрузки' }, { value: 'attachment', label: 'Забрала' }, { value: 'all', label: 'Все' },
          ]} />
        )}
        <Chip on={onlyMine} onClick={() => setOnlyMine(!onlyMine)} title="Только то, что можно купить на твоём уровне">Доступно мне</Chip>
      </div>

      {tab === 'ammo' && (
        <div className="flex flex-wrap gap-1">
          <Chip on={!caliber} onClick={() => setCaliber(null)}>Все калибры</Chip>
          {calibers.map((c) => <Chip key={c} on={caliber === c} onClick={() => setCaliber(caliber === c ? null : c)}>{caliberName(c)}</Chip>)}
        </div>
      )}

      {tab === 'ammo' ? (
        ammoList.length === 0 ? <Empty title="Пусто" /> : (
          <div className="panel overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-bg-1 z-10 border-b border-line">
                <tr>
                  <th className="w-12" />
                  <th className="py-2 px-2 text-left"><span className="eyebrow">Патрон</span></th>
                  <th className="py-2 px-2 text-left"><span className="eyebrow">Калибр</span></th>
                  {sortBtn(ammoSort, setAmmoSort, 'dmg', 'Урон')}
                  {sortBtn(ammoSort, setAmmoSort, 'pen', 'Пробитие')}
                  {sortBtn(ammoSort, setAmmoSort, 'armorDmg', 'По броне')}
                  {sortBtn(ammoSort, setAmmoSort, 'frag', 'Фраг')}
                  {sortBtn(ammoSort, setAmmoSort, 'speed', 'м/с')}
                  {sortBtn(ammoSort, setAmmoSort, 'price', 'Цена')}
                  <th className="py-2 px-2 text-right"><span className="eyebrow">Где</span></th>
                </tr>
              </thead>
              <tbody>
                {ammoList.map((i) => {
                  const a = i.ammo!
                  const buy = cheapestBuy(i, ctx)
                  const price = buy?.price ?? anyPrice(i, ctx)
                  return (
                    <tr key={i.id} className="border-b border-line/60 hover:bg-bg-2/60">
                      <td className="py-1 px-2"><ItemCell item={i} size={32} /></td>
                      <td className="py-1 px-2 text-ink truncate max-w-[280px]">{i.shortName}{a.tracer && <span className="ml-1 text-[10px] text-danger" title="Трассер">T</span>}</td>
                      <td className="py-1 px-2 text-ink-3">{caliberName(a.caliber)}</td>
                      <td className="py-1 px-2 text-right num">{a.projectileCount > 1 ? `${a.damage}×${a.projectileCount}` : a.damage}</td>
                      <td className="py-1 px-2 text-right num font-semibold" style={{ color: PEN_COLORS[penClass(a.penetrationPower)] }}>{a.penetrationPower}</td>
                      <td className="py-1 px-2 text-right num text-ink-2">{a.armorDamage}%</td>
                      <td className="py-1 px-2 text-right num text-ink-2">{Math.round(a.fragmentationChance * 100)}%</td>
                      <td className="py-1 px-2 text-right num text-ink-3">{a.initialSpeed}</td>
                      <td className="py-1 px-2 text-right"><Price value={price} dim={!buy} /></td>
                      <td className="py-1 px-2 text-right">
                        {buy?.source === 'trader' ? <TraderMark id={buy.trader!} size={16} /> : buy ? <span className="text-[10px] uppercase tracking-[.1em] text-info">рынок</span> : <span className="text-[10px] uppercase tracking-[.1em] text-ink-4">недоступно</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        armorList.length === 0 ? <Empty title="Пусто" /> : (
          <div className="panel overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-bg-1 z-10 border-b border-line">
                <tr>
                  <th className="w-12" />
                  <th className="py-2 px-2 text-left"><span className="eyebrow">Предмет</span></th>
                  {sortBtn(armorSort, setArmorSort, 'class', 'Класс')}
                  {sortBtn(armorSort, setArmorSort, 'durability', 'Прочн.')}
                  <th className="py-2 px-2 text-left"><span className="eyebrow">Материал</span></th>
                  {sortBtn(armorSort, setArmorSort, 'ergo', 'Эрго')}
                  {sortBtn(armorSort, setArmorSort, 'speed', 'Скорость')}
                  <th className="py-2 px-2 text-right"><span className="eyebrow">Поворот</span></th>
                  <th className="py-2 px-2 text-right"><span className="eyebrow">Плиты</span></th>
                  {sortBtn(armorSort, setArmorSort, 'price', 'Цена')}
                </tr>
              </thead>
              <tbody>
                {armorList.map((i) => {
                  const a = i.armor!
                  const buy = cheapestBuy(i, ctx)
                  const price = buy?.price ?? anyPrice(i, ctx)
                  const pct = (v: number) => v ? <span className={v < 0 ? 'text-danger' : 'text-fir'}>{Math.round(v * 100)}%</span> : <span className="text-ink-4">0</span>
                  return (
                    <tr key={i.id} className="border-b border-line/60 hover:bg-bg-2/60">
                      <td className="py-1 px-2"><ItemCell item={i} size={32} /></td>
                      <td className="py-1 px-2 text-ink truncate max-w-[300px]" title={a.zones.join(', ')}>{i.name}</td>
                      <td className="py-1 px-2 text-right num font-semibold" style={{ color: PEN_COLORS[Math.min(6, a.class)] }}>{a.class || '—'}</td>
                      <td className="py-1 px-2 text-right num text-ink-2">{a.durability || '—'}</td>
                      <td className="py-1 px-2 text-ink-3 truncate max-w-[120px]">{a.material || '—'}</td>
                      <td className="py-1 px-2 text-right num">{pct(a.ergoPenalty)}</td>
                      <td className="py-1 px-2 text-right num">{pct(a.speedPenalty)}</td>
                      <td className="py-1 px-2 text-right num">{pct(a.turnPenalty)}</td>
                      <td className="py-1 px-2 text-right num text-ink-3">{a.plateSlots || ''}</td>
                      <td className="py-1 px-2 text-right"><Price value={price} dim={!buy} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
