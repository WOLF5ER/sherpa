import { Check, Info, TriangleAlert } from 'lucide-react'
import { useToast } from '@/store/toast'

const ICON = { ok: Check, info: Info, err: TriangleAlert } as const
const COLOR = { ok: 'text-fir border-fir/40', info: 'text-info border-info/40', err: 'text-danger border-danger/40' } as const

export function Toaster() {
  const toasts = useToast((s) => s.toasts)
  const drop = useToast((s) => s.drop)
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-1.5 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => drop(t.id)}
            className={`pointer-events-auto glass flex items-center gap-2 max-w-[340px] rounded-[4px] border px-3 py-2 text-[13px] text-ink shadow-pop animate-[toast_.18s_ease-out] ${COLOR[t.kind]}`}
          >
            <Icon size={14} className="shrink-0" />
            <span className="truncate">{t.text}</span>
          </button>
        )
      })}
      <style>{`@keyframes toast { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  )
}
