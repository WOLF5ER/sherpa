/**
 * Ошибки страницы — в sherpa.log лаунчера (POST /api/log): window.onerror, необработанные промисы, ErrorBoundary.
 * Нужно, чтобы «у друга иногда падает» превращалось в конкретную строку лога. Без лаунчера запрос тихо не проходит.
 */

const LIMIT = 30
let sent = 0
const seen = new Set<string>()

export function reportError(kind: string, message: string, stack?: string, where?: string) {
  try {
    const key = `${kind}|${message}`.slice(0, 200)
    if (sent >= LIMIT || seen.has(key)) return
    seen.add(key)
    sent++
    // через туннель (https) страница гостя — лог ему не нужен, а у хоста /api/log есть только по http
    if (location.protocol === 'https:') return
    const body = JSON.stringify({ kind, message: String(message).slice(0, 600), stack: String(stack ?? '').slice(0, 1200), where: `${location.hash} ${where ?? ''}`.trim() })
    // keepalive — чтобы ошибка перед перезагрузкой страницы всё-таки дошла
    void fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch { /* лог — не повод падать ещё раз */ }
}

export function installCrashLog() {
  window.addEventListener('error', (e) => {
    const err = e.error as Error | undefined
    reportError('error', e.message || String(err), err?.stack, e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : undefined)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined
    const msg = typeof r === 'string' ? r : r?.message ?? String(r)
    // сетевые сбои (обновление цен, вики) — не ошибки приложения, но знать о них полезно
    reportError('promise', msg, typeof r === 'object' ? r?.stack : undefined)
  })
}
