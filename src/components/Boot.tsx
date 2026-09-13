import { useData } from '@/store/data'
import { useProfile } from '@/store/profile'

/** Экран загрузки справочника. Первый запуск качает ~4 МБ, дальше — кэш. */
export function Boot() {
  const status = useData((s) => s.status)
  const progress = useData((s) => s.progress)
  const error = useData((s) => s.error)
  const load = useData((s) => s.load)
  const mode = useProfile((s) => s.gameMode)

  return (
    <div className="h-full stash-grid grid place-items-center">
      <div className="w-[420px] max-w-[90vw]">
        <div className="display text-[64px] leading-none text-brass tracking-[.16em]">SHER<span className="text-ink-2">PA</span></div>
        <div className="mt-1 eyebrow">Проводник по Таркову · вне игры</div>

        <div className="mt-10 h-[2px] bg-line overflow-hidden rounded">
          {status === 'loading' && <div className="h-full w-1/3 bg-brass animate-[boot_1.2s_ease-in-out_infinite]" />}
          {status === 'error' && <div className="h-full w-full bg-danger" />}
        </div>
        <div className="mt-3 text-[13px] text-ink-3 min-h-[20px]">
          {status === 'error' ? (
            <div>
              <div className="text-danger">Не удалось загрузить данные: {error}</div>
              <div className="mt-1">Проверь интернет — справочник берётся с tarkov.dev.</div>
              <button type="button" onClick={() => load(mode)} className="mt-3 chip chip-on">Попробовать снова</button>
            </div>
          ) : progress}
        </div>
      </div>
      <style>{`@keyframes boot { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } }`}</style>
    </div>
  )
}
