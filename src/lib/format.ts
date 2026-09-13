const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

export function rub(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (n == null || Number.isNaN(n)) return '—'
  const v = Math.round(n)
  const s = nf.format(Math.abs(v)) + ' ₽'
  if (v < 0) return '−' + s
  if (opts.sign && v > 0) return '+' + s
  return s
}

/** Короткая форма: 1,2 млн / 594 тыс / 12 000 */
export function rubShort(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',')} млн ₽`
  if (a >= 100_000) return `${sign}${Math.round(a / 1000)} тыс ₽`
  return sign + nf.format(Math.round(a)) + ' ₽'
}

export function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  const s = `${Math.abs(n).toFixed(1).replace('.', ',')}%`
  return n < 0 ? `−${s}` : `+${s}`
}

export function duration(sec: number): string {
  if (sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d} д ${h % 24} ч`
  }
  if (h === 0) return `${m} мин`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'только что'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} мин назад`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.round(h / 24)} д назад`
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}
