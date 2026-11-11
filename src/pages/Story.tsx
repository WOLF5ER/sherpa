import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Check, Lock, Sparkles } from 'lucide-react'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import type { TaskView } from '@/lib/tasks'
import { Progress, TraderMark, Empty } from '@/components/ui'
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
  Tour: 'Экскурсия',
  Boreas: 'Борей',
}
/** Сюжетный порядок глав (Tour — вступительная) */
const CHAPTER_ORDER = ['Tour', 'Boreas']
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
    const out: Chapter[] = []
    for (const [name, objs] of byChapter) {
      const objectives: StoryObjective[] = [...objs.entries()]
        .map(([gate, quests]) => ({ gate, objective: gate.slice(gate.indexOf(':') + 1).trim(), quests: quests.sort((a, b) => a.task.minPlayerLevel - b.task.minPlayerLevel) }))
        .sort((a, b) => a.objective.localeCompare(b.objective, 'ru'))
      out.push({ name, objectives })
    }
    // порядок глав — сюжетный (Экскурсия первая), остальные за ней по алфавиту
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
          Сюжетные главы и их цели. Прогресс глав игра не отдаёт — отмечай цели вручную, и запертые за ними квесты сразу пересчитаются в «доступные».
          {total > 0 && <span className="num"> · <span className="text-fir">{doneN}</span> из {total} целей</span>}
        </div>
      </header>

      {chapters.length === 0 ? (
        <Empty title="Нет глав" hint="В текущих данных сюжетных глав нет." />
      ) : (
        chapters.map((c) => (
          <section key={c.name} className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <BookOpen size={15} className="text-brass-2" />
              <h2 className="display text-[20px] text-ink">{CHAPTER_RU[c.name] ?? c.name}</h2>
              {c.name !== (CHAPTER_RU[c.name] ?? c.name) && <span className="text-[12px] text-ink-4">{c.name}</span>}
            </div>
            <div className="flex flex-col gap-2.5">
              {c.objectives.map((o) => (
                <ObjectiveCard key={o.gate} obj={o} done={!!storyDone[o.gate]} onToggle={() => {
                  toggleStory(o.gate)
                  toast(storyDone[o.gate] ? `Отметка снята: ${o.objective}` : `Цель пройдена: ${o.objective}`, storyDone[o.gate] ? 'info' : 'ok')
                }} />
              ))}
            </div>
          </section>
        ))
      )}
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
