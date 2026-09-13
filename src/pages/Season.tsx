import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, EyeOff, MapPin } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import { ProfileSwitcher } from '@/components/ProfileSwitcher'
import { Eyebrow, Segmented, Toggle, TraderMark } from '@/components/ui'

type Scope = 'seasonal' | 'all'

const RARITY_LABEL: Record<string, string> = { common: 'обычное', rare: 'редкое', legendary: 'легендарное', seasonal: 'сезонное' }

export function SeasonPage() {
  const data = useGame()
  const views = useTaskViews()
  const seasonal = useProfile((s) => s.seasonal)
  const setSeasonal = useProfile((s) => s.setSeasonal)
  const fleaDisabled = useProfile((s) => s.fleaDisabled)
  const setFleaDisabled = useProfile((s) => s.setFleaDisabled)
  const done = useProfile((s) => s.achievements)
  const toggle = useProfile((s) => s.toggleAchievement)
  const [scope, setScope] = useState<Scope>('seasonal')
  const [hideDone, setHideDone] = useState(false)

  const achievements = useMemo(() => {
    let l = data.achievements
    if (scope === 'seasonal') l = l.filter((a) => a.rarity === 'seasonal')
    if (hideDone) l = l.filter((a) => !done[a.id])
    return [...l].sort((a, b) => Number(!!done[a.id]) - Number(!!done[b.id]) || b.playersCompletedPercent - a.playersCompletedPercent)
  }, [data, scope, hideDone, done])

  const seasonalTotal = data.achievements.filter((a) => a.rarity === 'seasonal').length
  const seasonalDone = data.achievements.filter((a) => a.rarity === 'seasonal' && done[a.id]).length

  // сезонные точки спавна (category season01) по картам
  const seasonSpawns = useMemo(() => Object.values(data.maps)
    .map((m) => ({ map: m, n: m.spawns.filter((s) => s.categories.some((c) => /^season/i.test(c))).length }))
    .filter((x) => x.n > 0), [data])

  // квесты, где встречаются сезонные противники
  const seasonTasks = useMemo(() => [...views.values()]
    .filter((v) => v.task.objectives.some((o) => /black division/i.test(o.description)) || /\[pvp zone\]/i.test(v.task.name))
    .sort((a, b) => a.task.minPlayerLevel - b.task.minPlayerLevel), [views])

  return (
    <div className="p-5 max-w-[1000px] mx-auto flex flex-col gap-8">
      <header>
        <h1 className="display text-[34px] text-ink">Сезон</h1>
        <div className="mt-1 text-[13px] text-ink-3">
          Сезонный контент приходит из тех же данных tarkov.dev: квесты, предметы, спавны. Чего в данных нет — модификаторы, которые ты выбрал при создании персонажа; их отмечаешь здесь сам.
        </div>
      </header>

      <section className="panel p-4 flex flex-col gap-4">
        <ProfileSwitcher />
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle value={seasonal} onChange={setSeasonal} label="Это сезонный персонаж (лента цен pvp-season)" />
          <Toggle value={fleaDisabled} onChange={setFleaDisabled} label="Модификатор «неработающая барахолка»" />
        </div>
        <div className="text-[12px] text-ink-3">
          С выключенной барахолкой все расчёты — «продать выгоднее», себестоимость крафтов, «что нести» — считаются только по торговцам.
          Про остальные модификаторы (Kappa Протокол, сломанные станции, болезни) приложение ничего не знает — они не влияют на квесты и цены.
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <Eyebrow>Достижения</Eyebrow>
            <div className="mt-1 text-[13px] text-ink-3 num">сезонных получено <span className="text-ink">{seasonalDone}</span> из {seasonalTotal}</div>
          </div>
          <div className="flex items-center gap-3">
            <Toggle value={hideDone} onChange={setHideDone} label="Скрыть полученные" />
            <Segmented value={scope} onChange={setScope} options={[{ value: 'seasonal', label: 'Сезонные' }, { value: 'all', label: 'Все' }]} />
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-1">
          {achievements.map((a) => {
            const isDone = !!done[a.id]
            return (
              <li key={a.id} className={`panel px-3 py-2 flex items-center gap-3 ${isDone ? 'opacity-55' : ''}`}>
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  title={isDone ? 'Снять отметку' : 'Получено'}
                  className={`w-6 h-6 shrink-0 rounded-[4px] border grid place-items-center transition-colors
                    ${isDone ? 'bg-fir/20 border-fir text-fir' : 'border-line-2 text-transparent hover:border-brass hover:text-brass/60'}`}
                >
                  <Check size={15} strokeWidth={3} />
                </button>
                {a.imageLink && <img src={a.imageLink} alt="" className="w-9 h-9 object-contain rounded-[3px] ibg-default border border-line-2" loading="lazy" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="display text-[15px] text-ink truncate">{a.name || 'Скрытое достижение'}</span>
                    <span className={`eyebrow ${a.rarity === 'seasonal' ? 'text-brass' : a.rarity === 'legendary' ? 'text-info' : ''}`}>{RARITY_LABEL[a.rarity] ?? a.rarity}</span>
                    {a.hidden && <EyeOff size={12} className="text-ink-4" />}
                  </div>
                  <div className="text-[12px] text-ink-2">{a.description}</div>
                </div>
                <span className="num text-[11px] text-ink-3 w-16 text-right" title="Доля игроков, получивших достижение">{a.playersCompletedPercent.toFixed(2)}%</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <Eyebrow>Сезонные точки спавна</Eyebrow>
          <ul className="mt-2 flex flex-col gap-1">
            {seasonSpawns.map(({ map, n }) => (
              <li key={map.id}>
                <Link to={`/maps?map=${map.normalizedName}`} className="panel px-3 py-2 flex items-center gap-2 hover:border-line-2">
                  <MapPin size={14} className="text-ink-3" />
                  <span className="flex-1">{map.name}</span>
                  <span className="num text-ink-3">{n}</span>
                </Link>
              </li>
            ))}
            {seasonSpawns.length === 0 && <li className="text-[13px] text-ink-3">В данных пока нет</li>}
          </ul>
          <div className="mt-2 text-[12px] text-ink-3">На карте — слой «Сезонные спавны».</div>
        </div>
        <div>
          <Eyebrow>Квесты с сезонными противниками</Eyebrow>
          <ul className="mt-2 flex flex-col gap-1">
            {seasonTasks.map((v) => (
              <li key={v.task.id}>
                <Link to={`/tasks?q=${encodeURIComponent(v.task.name)}`} className={`panel px-3 py-2 flex items-center gap-2 hover:border-line-2 ${v.status === 'done' ? 'opacity-50' : ''}`}>
                  <TraderMark id={v.task.trader} size={20} />
                  <span className="flex-1 truncate">{v.task.name}</span>
                  <span className={`eyebrow ${v.status === 'available' ? 'text-fir' : ''}`}>{v.status === 'available' ? 'доступен' : v.status === 'done' ? 'выполнен' : `${v.task.minPlayerLevel} ур.`}</span>
                </Link>
              </li>
            ))}
            {seasonTasks.length === 0 && <li className="text-[13px] text-ink-3">В данных пока нет</li>}
          </ul>
        </div>
      </section>
    </div>
  )
}
