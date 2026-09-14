import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp, ExternalLink, Check, X, Warehouse, ListChecks } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import { SKILLS, SKILL_GROUPS, SKILL_RULES, findSkill, type SkillDef, type SkillGroup } from '@/data/skills'
import { wikiImageUrls, wikiThumb, WIKI_CREDIT } from '@/lib/wiki'
import { norm } from '@/lib/search'
import { plural } from '@/lib/format'
import type { TaskStatus } from '@/lib/tasks'
import { Chip, Eyebrow, Progress, Segmented, Toggle } from '@/components/ui'

/** Кому нужен навык: уровень схрона или квест с требованием */
interface Requirement {
  kind: 'hideout' | 'task'
  id: string
  label: string
  level: number
  /** схрон: уже построено; квест: выполнен */
  done: boolean
  /** квест: статус, чтобы красить */
  status?: TaskStatus
}

const STATUS_CLS: Record<TaskStatus, string> = { done: 'text-ink-4', available: 'text-brass-2', locked: 'text-ink-3' }

export function SkillsPage() {
  const data = useGame()
  const views = useTaskViews()
  const skills = useProfile((s) => s.skills)
  const setSkill = useProfile((s) => s.setSkill)
  const stations = useProfile((s) => s.stations)
  const [group, setGroup] = useState<SkillGroup | 'all'>('all')
  const [q, setQ] = useState('')
  const [onlyRequired, setOnlyRequired] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [icons, setIcons] = useState<Record<string, string>>({})

  useEffect(() => {
    let on = true
    void wikiImageUrls(SKILLS.map((s) => s.icon)).then((u) => { if (on) setIcons(u) })
    return () => { on = false }
  }, [])

  // требования: схрон (skillRequirements уровней) и квесты (пункт «достичь уровня навыка»)
  const requirements = useMemo(() => {
    const out = new Map<string, Requirement[]>()
    const push = (skillName: string, r: Requirement) => {
      const s = findSkill(skillName)
      if (!s) return
      const list = out.get(s.id) ?? out.set(s.id, []).get(s.id)!
      list.push(r)
    }
    for (const st of Object.values(data.stations)) {
      for (const l of st.levels) for (const r of l.skillRequirements) {
        push(r.skill, { kind: 'hideout', id: st.id, label: `${st.name} ${l.level}`, level: r.level, done: (stations[st.id] ?? 0) >= l.level })
      }
    }
    for (const v of views.values()) {
      for (const o of v.task.objectives) if (o.skill) {
        push(o.skill.name, { kind: 'task', id: v.task.id, label: v.task.name, level: o.skill.level, done: v.status === 'done', status: v.status })
      }
    }
    for (const list of out.values()) list.sort((a, b) => a.level - b.level)
    return out
  }, [data, views, stations])

  // квесты-награды: английское имя с вики → квест tarkov.dev
  const tasksByEn = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of Object.values(data.tasks)) m.set(norm(t.nameEn), t.id)
    return m
  }, [data])

  const list = useMemo(() => {
    let l = SKILLS
    if (group !== 'all') l = l.filter((s) => s.group === group)
    if (onlyRequired) l = l.filter((s) => (requirements.get(s.id) ?? []).some((r) => !r.done))
    if (q.trim()) {
      const n = norm(q)
      l = l.filter((s) => norm(s.name).includes(n) || norm(s.nameEn).includes(n) || norm(s.desc).includes(n) || s.howTo.some((h) => norm(h).includes(n)))
    }
    return l
  }, [group, onlyRequired, q, requirements])

  const groupsShown = SKILL_GROUPS.filter((g) => list.some((s) => s.group === g.id))

  return (
    <div className="p-5 max-w-[1200px] mx-auto flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Навыки</h1>
          <div className="mt-1 text-[13px] text-ink-3">Что даёт каждый навык и чем он качается — обычными действиями в игре. Свой уровень введи руками: игра его наружу не отдаёт.</div>
        </div>
        <Segmented value={group} onChange={setGroup} options={[{ value: 'all', label: 'Все' }, ...SKILL_GROUPS.map((g) => ({ value: g.id, label: g.label }))]} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Навык или действие" className="input focus:input-focus pl-8 w-64" />
        </label>
        <Toggle value={onlyRequired} onChange={setOnlyRequired} label="Только те, что требуются схрону и квестам" />
        <button type="button" onClick={() => setRulesOpen(!rulesOpen)} className="ml-auto chip hover:text-ink hover:border-ink-4">
          Как это работает {rulesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {rulesOpen && (
        <section className="panel p-4 text-[13px] text-ink-2 leading-5">
          <Eyebrow>Общие правила</Eyebrow>
          <ul className="mt-2 list-disc pl-5 flex flex-col gap-1">
            {SKILL_RULES.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <Eyebrow className="mt-3">Ускорители в схроне</Eyebrow>
          <ul className="mt-2 list-disc pl-5 flex flex-col gap-1">
            {SKILL_GROUPS.map((g) => <li key={g.id}><span className="text-ink">{g.label}:</span> {g.hint}</li>)}
          </ul>
          <div className="mt-3 text-[11px] text-ink-4">{WIKI_CREDIT}, страницы навыков — сверено 14.09.2026</div>
        </section>
      )}

      {groupsShown.map((g) => (
        <section key={g.id}>
          <div className="flex items-baseline justify-between">
            <Eyebrow>{g.label}</Eyebrow>
            <span className="text-[12px] text-ink-3">{g.hint}</span>
          </div>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {list.filter((s) => s.group === g.id).map((s) => (
              <SkillCard key={s.id} skill={s} icon={icons[s.icon]} level={skills[s.id] ?? 0} onLevel={(v) => setSkill(s.id, v)}
                requirements={requirements.get(s.id) ?? []} tasksByEn={tasksByEn} views={views} />
            ))}
          </div>
        </section>
      ))}
      {list.length === 0 && <div className="text-[13px] text-ink-3">Ничего не нашлось.</div>}
    </div>
  )
}

function SkillCard({ skill: s, icon, level, onLevel, requirements, tasksByEn, views }: {
  skill: SkillDef; icon?: string; level: number; onLevel: (v: number) => void; requirements: Requirement[]
  tasksByEn: Map<string, string>; views: ReturnType<typeof useTaskViews>
}) {
  const [open, setOpen] = useState(false)
  const pending = requirements.filter((r) => !r.done)
  const nextNeed = pending.find((r) => r.level > level)
  const rewards = (s.rewardQuests ?? []).map((n) => ({ name: n, id: tasksByEn.get(norm(n)) })).filter((r) => r.id)
  return (
    <div className={`panel p-3 flex flex-col gap-2 ${s.note ? 'opacity-90' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 rounded-[4px] border border-line-2 bg-bg grid place-items-center overflow-hidden" title={WIKI_CREDIT}>
          {icon ? <img src={wikiThumb(icon, 80)} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain" loading="lazy" /> : <span className="display text-[14px] text-ink-4">{s.nameEn.slice(0, 2)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] text-ink truncate">{s.name}</div>
          <div className="text-[11px] text-ink-3 truncate">{s.nameEn}{s.note ? <span className="text-scav"> · {s.note}</span> : ''}</div>
        </div>
        <label className="shrink-0 flex flex-col items-end gap-1" title="Мой уровень (0–51), вручную">
          <div className="flex items-center gap-1.5">
            <span className="eyebrow">Мой</span>
            <input type="number" min={0} max={51} value={level || ''} placeholder="—" onChange={(e) => onLevel(Number(e.target.value))}
              className={`input focus:input-focus num h-8 w-16 text-center text-[14px] ${level >= 51 ? 'text-brass-2 border-brass-3' : ''}`} />
          </div>
          <Progress value={level / 51} className="w-24" />
        </label>
      </div>

      <div className="text-[13px] text-ink-2">{s.desc}</div>

      {requirements.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {requirements.map((r) => {
            const met = r.done || (level > 0 && level >= r.level)
            const cls = r.done ? 'text-ink-4 border-line' : met ? 'text-fir border-fir/50' : level > 0 ? 'text-danger border-danger/50' : r.status ? `${STATUS_CLS[r.status]} border-line-2` : 'text-ink-2 border-line-2'
            const inner = (
              <>
                {r.kind === 'hideout' ? <Warehouse size={11} /> : <ListChecks size={11} />}
                <span className="truncate max-w-[220px]">{r.label}</span>
                <span className="num">ур. {r.level}</span>
                {r.done ? <Check size={11} /> : met ? <Check size={11} /> : level > 0 ? <X size={11} /> : null}
              </>
            )
            return r.kind === 'task'
              ? <Link key={`${r.kind}-${r.id}-${r.level}`} to={`/tasks?q=${encodeURIComponent(r.label)}`} className={`inline-flex items-center gap-1 h-6 px-2 rounded-[3px] border text-[11px] bg-bg hover:border-brass-3 ${cls}`} title={r.done ? 'Квест выполнен' : `Квест требует навык ${r.level}`}>{inner}</Link>
              : <Link key={`${r.kind}-${r.id}-${r.level}`} to="/hideout" className={`inline-flex items-center gap-1 h-6 px-2 rounded-[3px] border text-[11px] bg-bg hover:border-brass-3 ${cls}`} title={r.done ? 'Уровень уже построен' : `Для этого уровня станции нужен навык ${r.level}`}>{inner}</Link>
          })}
        </div>
      )}
      {nextNeed && level > 0 && <div className="text-[12px] text-scav">До «{nextNeed.label}» не хватает {nextNeed.level - level} {plural(nextNeed.level - level, 'уровень', 'уровня', 'уровней')}</div>}

      <div>
        <Eyebrow>Как качать</Eyebrow>
        <ul className="mt-1 list-disc pl-4 text-[13px] text-ink-2 flex flex-col gap-0.5">
          {s.howTo.map((h, i) => <li key={i}>{h}</li>)}
        </ul>
      </div>

      {open && (
        <>
          <div>
            <Eyebrow>Даёт за уровень</Eyebrow>
            <ul className="mt-1 list-disc pl-4 text-[13px] text-ink-2 flex flex-col gap-0.5">
              {s.effects.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
          <div>
            <Eyebrow className="text-brass">Элитный (51)</Eyebrow>
            <ul className="mt-1 list-disc pl-4 text-[13px] text-ink-2 flex flex-col gap-0.5">
              {s.elite.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
          {s.tips && s.tips.length > 0 && (
            <div>
              <Eyebrow>Советы</Eyebrow>
              <ul className="mt-1 list-disc pl-4 text-[13px] text-ink-3 flex flex-col gap-0.5">
                {s.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          {rewards.length > 0 && (
            <div>
              <Eyebrow>Уровни наградой за квесты</Eyebrow>
              <div className="mt-1 flex flex-wrap gap-1">
                {rewards.map((r) => {
                  const v = views.get(r.id!)
                  return (
                    <Link key={r.id} to={`/tasks?q=${encodeURIComponent(v?.task.name ?? r.name)}`} className={`chip hover:border-brass-3 ${v?.status === 'done' ? 'opacity-50' : ''}`} title={v?.status === 'done' ? 'выполнен' : v?.status === 'available' ? 'доступен' : 'впереди'}>
                      <span className={`w-1.5 h-1.5 rounded-full ${v?.status === 'done' ? 'bg-ink-4' : v?.status === 'available' ? 'bg-fir' : 'bg-ink-3'}`} />
                      {v?.task.name ?? r.name}
                    </Link>
                  )
                })}
              </div>
              <div className="mt-1 text-[11px] text-ink-4">Сдавать выгодно, когда навык уже ≥ 9 — награда даст больше очков.</div>
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        <Chip onClick={() => setOpen(!open)}>{open ? <>Свернуть <ChevronUp size={12} /></> : <>Эффекты, элита, советы <ChevronDown size={12} /></>}</Chip>
        <a href={s.wiki} target="_blank" rel="noreferrer" className="ml-auto text-[11px] text-ink-4 hover:text-ink-2 inline-flex items-center gap-1">вики <ExternalLink size={10} /></a>
      </div>
    </div>
  )
}

