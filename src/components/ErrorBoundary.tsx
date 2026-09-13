import { Component, type ReactNode } from 'react'
import { clearCache } from '@/data/loader'
import { useProfile } from '@/store/profile'

interface State { error: Error | null }

/** Ловит ошибку рендера, чтобы вместо белого экрана было понятно, что делать. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[sherpa] render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const reset = async () => {
      try { await clearCache(useProfile.getState().gameMode) } catch { /* ignore */ }
      location.reload()
    }
    return (
      <div className="h-full stash-grid grid place-items-center p-6">
        <div className="panel p-6 max-w-[520px]">
          <div className="display text-[22px] text-danger">Что-то сломалось</div>
          <div className="mt-2 text-[13px] text-ink-2">Страница упала с ошибкой. Обычно помогает перезагрузка; если повторяется — перекачать справочник.</div>
          <pre className="mt-3 text-[11px] text-ink-3 whitespace-pre-wrap break-words max-h-40 overflow-auto num">{String(this.state.error?.message ?? this.state.error)}</pre>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => location.reload()} className="chip chip-on">Перезагрузить</button>
            <button type="button" onClick={reset} className="chip hover:text-ink">Перекачать справочник и перезагрузить</button>
          </div>
        </div>
      </div>
    )
  }
}
