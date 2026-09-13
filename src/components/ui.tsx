import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { rub, pct } from '@/lib/format'
import { useGame } from '@/store/data'

export function Chip({ on, onClick, children, title, className = '' }: {
  on?: boolean; onClick?: () => void; children: ReactNode; title?: string; className?: string
}) {
  return (
    <button type="button" title={title} onClick={onClick} className={`chip ${on ? 'chip-on' : 'hover:text-ink hover:border-ink-4'} ${className}`}>
      {children}
    </button>
  )
}

export function Price({ value, className = '', sign = false, dim = false }: {
  value: number | null | undefined; className?: string; sign?: boolean; dim?: boolean
}) {
  const neg = value != null && value < 0
  return (
    <span className={`num whitespace-nowrap ${neg ? 'text-danger' : dim ? 'text-ink-2' : ''} ${className}`}>{rub(value, { sign })}</span>
  )
}

export function Delta({ value }: { value: number | null | undefined }) {
  if (value == null) return null
  const cls = value > 0.5 ? 'text-fir' : value < -0.5 ? 'text-danger' : 'text-ink-3'
  return <span className={`num text-[11px] ${cls}`}>{pct(value)}</span>
}

export function TraderMark({ id, size = 20, className = '' }: { id: string; size?: number; className?: string }) {
  const data = useGame()
  const t = data.traders[id]
  if (!t) return null
  return (
    <img
      src={t.imageLink}
      alt={t.name}
      title={t.name}
      width={size}
      height={size}
      className={`rounded-[3px] object-cover shrink-0 border border-line-2 ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-ink-2 hover:text-ink" onClick={() => onChange(!value)}>
      <span
        role="switch"
        aria-checked={value}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!value) } }}
        className={`relative w-8 h-[18px] rounded-full border transition-colors ${value ? 'bg-brass-3/60 border-brass-3' : 'bg-bg-3 border-line-2'}`}
      >
        <span className={`absolute top-[2px] w-3 h-3 rounded-full transition-all ${value ? 'left-[16px] bg-brass-2' : 'left-[2px] bg-ink-3'}`} />
      </span>
      <span className="text-[13px]">{label}</span>
    </label>
  )
}

export function Stepper({ value, onChange, max, min = 0 }: { value: number; onChange: (v: number) => void; max?: number; min?: number }) {
  const clamp = (v: number) => Math.max(min, max != null ? Math.min(max, v) : v)
  return (
    <div className="inline-flex items-center h-7 rounded-[4px] border border-line-2 bg-bg overflow-hidden">
      <button type="button" className="w-7 h-full grid place-items-center text-ink-3 hover:text-ink hover:bg-bg-2" onClick={() => onChange(clamp(value - 1))} aria-label="Меньше">
        <Minus size={13} />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        className="num w-10 h-full text-center bg-transparent outline-none text-[13px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" className="w-7 h-full grid place-items-center text-ink-3 hover:text-ink hover:bg-bg-2" onClick={() => onChange(clamp(value + 1))} aria-label="Больше">
        <Plus size={13} />
      </button>
    </div>
  )
}

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="stash-grid rounded-md border border-line p-10 text-center">
      <div className="display text-xl text-ink-2">{title}</div>
      {hint && <div className="mt-2 text-ink-3 max-w-md mx-auto">{hint}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num inline-flex items-center h-5 px-1.5 rounded-[3px] border border-line-2 bg-bg-2 text-[10px] text-ink-3">{children}</kbd>
  )
}

export function FirBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold tracking-[.1em] uppercase text-fir ${className}`} title="Найдено в рейде">
      <span className="w-[7px] h-[7px] rounded-full bg-fir" />FIR
    </span>
  )
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={`h-[3px] w-full rounded-full bg-bg-3 overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${v >= 1 ? 'bg-fir' : 'bg-brass'}`} style={{ width: `${v * 100}%` }} />
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]
}) {
  return (
    <div className="inline-flex h-8 rounded-[4px] border border-line-2 bg-bg p-[2px] gap-[2px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`display text-[12px] tracking-[.1em] px-3 rounded-[3px] transition-colors ${value === o.value ? 'bg-bg-3 text-brass-2' : 'text-ink-3 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
