import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Check, Lock, Sparkles } from 'lucide-react'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import type { TaskView } from '@/lib/tasks'
import { Progress, TraderMark } from '@/components/ui'
import { toast } from '@/store/toast'

interface StoryObjective {
  /** полный ключ storyGate «Глава: Цель» */
  gate: string
  objective: string
  quests: TaskView[]
}
interface Chapter {
  name: string
  objectives: StoryObjective[]
}

/** Переводим главы и цели с английского (в данных они en-строками). */
const CHAPTER_RU: Record<string, string> = {
  Tour: 'Тур',
  Boreas: 'Борей',
}
/** Сюжетный порядок глав (Tour — вступительная) */
const CHAPTER_ORDER = ['Tour', 'Falling Skies', 'The Ticket', 'Batya', 'Accidental Witness', 'Blue Fire', 'Boreas', 'The Labyrinth', 'The Unheard', 'They Are Already Here']

/**
 * Гид по главам (данных tarkov.dev по ним нет — главы после Тура открываются через мир: записки, места).
 * main — обязательные для основной концовки, остальные влияют на «лучшую» концовку.
 */
const CHAPTER_GUIDE: Record<string, { ru: string; how: string; main?: boolean }> = {
  'Tour': { ru: 'Тур', main: true, how: 'Вступительная глава — открывается после обучения. Знакомство с торговцами и доступ к картам.' },
  'Falling Skies': { ru: 'Падающие небеса', main: true, how: 'Найди упавший самолёт в Лесу. Первая глава с сюжетным выбором.' },
  'The Ticket': { ru: 'Билет', main: true, how: 'Открывается после «Падающих небес». Основная линия — ведёт к одной из четырёх концовок.' },
  'Batya': { ru: 'Батя', how: 'Подбери нашивку «Богатырь» на Таможне: металлическое строение у электростанции южнее заправки.' },
  'Accidental Witness': { ru: 'Случайный свидетель', how: 'Осмотри разрисованные машины между общежитиями на Таможне.' },
  'Blue Fire': { ru: 'Синее пламя', how: 'Прочти листовку МЧС в зелёном контейнере на военной базе в Лесу.' },
  'Boreas': { ru: 'Борей', how: 'Сигнал бедствия ведёт на замёрзший Ледокол — штурм надстройки и спасение капитана.' },
  'The Labyrinth': { ru: 'Лабиринт', how: 'Тоннель в подвале санатория на Берегу — туда ведёт цепочка Механика.' },
  'The Unheard': { ru: 'Неслышимый', how: 'Прочти записку об «Очищении» на первом этаже офисов TerraGroup на Улицах Таркова.' },
  'They Are Already Here': { ru: 'Они уже здесь', how: 'Записка об «Оке мира»: добывается с сектанта, в общаге 314 на Таможне или в круге сектантов у Заброшенной деревни в Лесу.' },
}
const OBJECTIVE_RU: Record<string, string> = {
  'Talk to Therapist': 'Поговорить с Терапевтом',
  'Talk to Skier': 'Поговорить с Лыжником',
  'Talk to Mechanic': 'Поговорить с Механиком',
  'Talk to Ragman': 'Поговорить с Барахольщиком',
  'Ask Mechanic for help decoding the hard drives from the icebreaker': 'Попросить Механика расшифровать диски с Ледокола',
}

export function StoryPage() {
  const views = useTaskViews()
  const storyDone = useProfile((s) => s.storyDone)
  const toggleStory = useProfile((s) => s.toggleStory)

  const chapters = useMemo(() => {
    const byChapter = new Map<string, Map<string, TaskView[]>>()
    for (const v of views.values()) {
      const g = v.task.storyGate
      if (!g) continue
      const sep = g.indexOf(':')
      const chapter = sep === -1 ? g : g.slice(0, sep)
      ;(byChapter.get(chapter) ?? byChapter.set(chapter, new Map()).get(chapter)!)
        .set(g, [...(byChapter.get(chapter)!.get(g) ?? []), v])
    }
    // главы из гида без данных тоже показываем (открываются через мир, а не квесты)
    for (const name of CHAPTER_ORDER) if (!byChapter.has(name)) byChapter.set(name, new Map())
    const out: Chapter[] = []
    for (const [name, objs] of byChapter) {
      const objectives: StoryObjective[] = [...objs.entries()]
        .map(([gate, quests]) => ({ gate, objective: gate.slice(gate.indexOf(':') + 1).trim(), quests: quests.sort((a, b) => a.task.minPlayerLevel - b.task.minPlayerLevel) }))
        .sort((a, b) => a.objective.localeCompare(b.objective, 'ru'))
      out.push({ name, objectives })
    }
    // порядок глав — сюжетный (Тур первая), неизвестные — в конец по алфавиту
    const order = (name: string) => { const i = CHAPTER_ORDER.indexOf(name); return i === -1 ? CHAPTER_ORDER.length : i }
    return out.sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name, 'ru'))
  }, [views])

  const total = chapters.reduce((n, c) => n + c.objectives.length, 0)
  const doneN = chapters.reduce((n, c) => n + c.objectives.filter((o) => storyDone[o.gate]).length, 0)

  return (
    <div className="p-5 max-w-[1100px] mx-auto flex flex-col gap-4">
      <header>
        <h1 className="display text-[34px] text-ink">Сюжет</h1>
        <div className="mt-1 text-[13px] text-ink-3">
          Главы сюжета и их цели. Прогресс глав игра не отдаёт — отмечай вручную; цели «Тура» и «Борея» отпирают запертые за ними квесты.
          {total > 0 && <span className="num"> · <span className="text-fir">{doneN}</span> из {total} целей</span>}
        </div>
      </header>

      {chapters.map((c) => {
        const guide = CHAPTER_GUIDE[c.name]
        const chapterKey = `chapter:${c.name}`
        const chapterDone = !!storyDone[chapterKey]
        const gatesDone = c.objectives.filter((o) => storyDone[o.gate]).length
        return (
          <section key={c.name} className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <BookOpen size={15} className={guide?.main ? 'text-brass-2' : 'text-ink-3'} />
              <h2 className="display text-[20px] text-ink">{guide?.ru ?? CHAPTER_RU[c.name] ?? c.name}</h2>
              <span className="text-[12px] text-ink-4">{c.name}</span>
              {guide?.main
                ? <span className="display text-[10px] text-brass border border-brass-3 rounded-[3px] px-1 leading-[14px]" title="Обязательна для основной концовки">Основная</span>
                : <span className="display text-[10px] text-ink-3 border border-line-2 rounded-[3px] px-1 leading-[14px]" title="Необязательная глава — нужна для «лучшей» концовки">Побочная</span>}
              {c.objectives.length > 0 && <span className="ml-auto num text-[12px] text-ink-3">{gatesDone}/{c.objectives.length} целей</span>}
            </div>
            {guide && <p className="text-[13px] text-ink-3 leading-snug">{guide.how}</p>}
            {c.objectives.length === 0 && (
              <button
                type="button"
                onClick={() => { toggleStory(chapterKey); toast(chapterDone ? `Отметка снята: ${guide?.ru ?? c.name}` : `Глава пройдена: ${guide?.ru ?? c.name}`, chapterDone ? 'info' : 'ok') }}
                className={`self-start inline-flex items-center gap-2 rounded-[5px] border px-2.5 py-1.5 text-[12px] display transition-colors ${chapterDone ? 'border-fir/60 bg-fir/10 text-fir' : 'border-line-2 text-ink-3 hover:border-brass hover:text-brass-2'}`}
              >
                <Check size={13} strokeWidth={3} /> {chapterDone ? 'Глава пройдена' : 'Отметить главу пройденной'}
              </button>
            )}
            <div className="flex flex-col gap-2.5">
              {c.objectives.map((o) => (
                <ObjectiveCard key={o.gate} obj={o} done={!!storyDone[o.gate]} onToggle={() => {
                  toggleStory(o.gate)
                  toast(storyDone[o.gate] ? `Отметка снята: ${o.objective}` : `Цель пройдена: ${o.objective}`, storyDone[o.gate] ? 'info' : 'ok')
                }} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ObjectiveCard({ obj, done, onToggle }: { obj: StoryObjective; done: boolean; onToggle: () => void }) {
  const questsDone = obj.quests.filter((q) => q.status === 'done').length
  // автоподсказка: все квесты за целью выполнены, а цель не отмечена — почти наверняка пройдена
  const suggestDone = !done && obj.quests.length > 0 && questsDone === obj.quests.length
  return (
    <div className={`rounded-[6px] border p-3 ${done ? 'border-fir/40 bg-fir/5' : 'border-line bg-bg-2'}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          title={done ? 'Снять отметку' : 'Отметить цель пройденной'}
          className={`w-6 h-6 shrink-0 rounded-[4px] border grid place-items-center transition-colors ${done ? 'bg-fir/20 border-fir text-fir' : 'border-line-2 text-transparent hover:border-brass hover:text-brass/60'}`}
        >
          <Check size={15} strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className={`display text-[15px] ${done ? 'text-ink-2 line-through' : 'text-ink'}`}>{OBJECTIVE_RU[obj.objective] ?? obj.objective}</div>
          <div className="text-[12px] text-ink-3 num">отпирает {obj.quests.length} квест{obj.quests.length > 1 ? (obj.quests.length < 5 ? 'а' : 'ов') : ''} · выполнено {questsDone}</div>
        </div>
        {suggestDone && (
          <span className="inline-flex items-center gap-1 text-[11px] text-brass-2" title="Все квесты за этой целью уже выполнены — скорее всего, цель пройдена, можно отметить">
            <Sparkles size={12} /> похоже, пройдена
          </span>
        )}
        <div className="w-28 shrink-0 hidden sm:block">
          <Progress value={obj.quests.length ? questsDone / obj.quests.length : 0} />
        </div>
      </div>
      <ul className="mt-2 ml-9 flex flex-col gap-1">
        {obj.quests.map((q) => (
          <li key={q.task.id} className="flex items-center gap-2 text-[12.5px]">
            <TraderMark id={q.task.trader} size={18} />
            <Link to={`/tasks?task=${q.task.id}`} className={`truncate hover:text-brass-2 ${q.status === 'done' ? 'text-ink-4 line-through' : q.status === 'available' ? 'text-ink' : 'text-ink-3'}`}>
              {q.task.name}
            </Link>
            {q.status === 'locked' && <Lock size={10} className="text-ink-4 shrink-0" />}
            {q.status === 'done' && <Check size={11} className="text-fir shrink-0" />}
            <span className="ml-auto text-[11px] text-ink-4 shrink-0">{q.task.minPlayerLevel > 0 ? `${q.task.minPlayerLevel} ур.` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
