import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Map as MapIcon, ListChecks } from 'lucide-react'
import { useGame } from '@/store/data'
import { useUI } from '@/store/ui'
import { search } from '@/lib/search'
import { fleaPrice } from '@/lib/flea'
import { ItemCell } from './ItemCell'
import { Price, TraderMark, Kbd } from './ui'

type Row =
  | { kind: 'item'; id: string; name: string }
  | { kind: 'task'; id: string; name: string }
  | { kind: 'map'; id: string; name: string }

export function SearchPalette() {
  const open = useUI((s) => s.paletteOpen)
  const setOpen = useUI((s) => s.setPalette)
  const openItem = useUI((s) => s.openItem)
  const data = useGame()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setQ(''); setCursor(0); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [open])

  const itemList = useMemo(() => Object.values(data.items).filter((i) => !i.types.includes('preset')), [data])
  const taskList = useMemo(() => Object.values(data.tasks), [data])
  const mapList = useMemo(() => Object.values(data.maps).filter((m) => m.extracts.length || m.spawns.length), [data])

  const rows = useMemo<Row[]>(() => {
    if (!q.trim()) return []
    const items = search(q, itemList, 8).map((i) => ({ kind: 'item' as const, id: i.id, name: i.name }))
    const tasks = search(q, taskList, 5).map((t) => ({ kind: 'task' as const, id: t.id, name: t.name }))
    const maps = search(q, mapList, 3).map((m) => ({ kind: 'map' as const, id: m.id, name: m.name }))
    return [...items, ...tasks, ...maps]
  }, [q, itemList, taskList, mapList])

  useEffect(() => setCursor(0), [rows.length])

  if (!open) return null

  const go = (r: Row) => {
    setOpen(false)
    if (r.kind === 'item') openItem(r.id)
    if (r.kind === 'task') nav(`/tasks?q=${encodeURIComponent(r.name)}`)
    if (r.kind === 'map') nav(`/maps?map=${data.maps[r.id].normalizedName}`)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-[620px] max-w-[92vw] panel shadow-[0_30px_80px_rgba(0,0,0,.6)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-line">
          <Search size={17} className="text-ink-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
              if (e.key === 'Enter' && rows[cursor]) go(rows[cursor])
            }}
            placeholder="Предмет, квест или карта — можно в любой раскладке"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-ink-4"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {rows.length === 0 && q && <div className="p-6 text-center text-ink-3">Ничего не нашлось</div>}
          {rows.length === 0 && !q && (
            <div className="p-6 text-[13px] text-ink-3">
              Например: <span className="text-ink-2">ledx</span>, <span className="text-ink-2">графическая карта</span>, <span className="text-ink-2">Стрелок</span>, <span className="text-ink-2">Таможня</span>
            </div>
          )}
          {rows.map((r, i) => {
            const active = i === cursor
            const cls = `w-full flex items-center gap-3 px-4 py-2 text-left ${active ? 'bg-bg-3' : 'hover:bg-bg-2'}`
            if (r.kind === 'item') {
              const it = data.items[r.id]
              return (
                <button key={r.kind + r.id} type="button" className={cls} onMouseEnter={() => setCursor(i)} onClick={() => go(r)}>
                  <ItemCell item={it} size={34} onClick={() => go(r)} />
                  <span className="flex-1 min-w-0 truncate">{it.name}</span>
                  <span className="num text-[11px] text-ink-3">{it.width}×{it.height}</span>
                  <Price value={fleaPrice(it)} className="text-ink-2 text-[13px]" />
                </button>
              )
            }
            if (r.kind === 'task') {
              const t = data.tasks[r.id]
              return (
                <button key={r.kind + r.id} type="button" className={cls} onMouseEnter={() => setCursor(i)} onClick={() => go(r)}>
                  <span className="w-[34px] grid place-items-center text-ink-3"><ListChecks size={16} /></span>
                  <span className="flex-1 min-w-0 truncate">{t.name}</span>
                  <TraderMark id={t.trader} size={18} />
                  <span className="num text-[11px] text-ink-3">{t.minPlayerLevel} ур.</span>
                </button>
              )
            }
            return (
              <button key={r.kind + r.id} type="button" className={cls} onMouseEnter={() => setCursor(i)} onClick={() => go(r)}>
                <span className="w-[34px] grid place-items-center text-ink-3"><MapIcon size={16} /></span>
                <span className="flex-1 min-w-0 truncate">{r.name}</span>
                <span className="eyebrow">карта</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
