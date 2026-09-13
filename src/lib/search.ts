const RU = 'йцукенгшщзхъфывапролджэячсмитьбю.'
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./"
const ru2en = new Map([...RU].map((c, i) => [c, EN[i]]))
const en2ru = new Map([...EN].map((c, i) => [c, RU[i]]))

export function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"'`]/g, '').trim()
}

/** Если набрали в другой раскладке — вторая версия запроса. */
function swapLayout(s: string): string {
  return [...s].map((c) => ru2en.get(c) ?? en2ru.get(c) ?? c).join('')
}

export interface Searchable {
  id: string
  name: string
  shortName?: string
  nameEn?: string
}

export function score(q: string, e: Searchable): number {
  if (!q) return 1
  const fields = [norm(e.name), e.shortName ? norm(e.shortName) : '', e.nameEn ? norm(e.nameEn) : '']
  let best = 0
  for (const f of fields) {
    if (!f) continue
    if (f === q) return 100
    if (f.startsWith(q)) best = Math.max(best, 60 + q.length / f.length * 20)
    else if (f.includes(' ' + q)) best = Math.max(best, 40)
    else if (f.includes(q)) best = Math.max(best, 20)
  }
  return best
}

export function search<T extends Searchable>(query: string, list: T[], limit = 50): T[] {
  const q = norm(query)
  if (!q) return list.slice(0, limit)
  const alt = swapLayout(q)
  const scored: { e: T; s: number }[] = []
  for (const e of list) {
    let s = score(q, e)
    if (s === 0 && alt !== q) s = score(alt, e) * 0.9
    if (s > 0) scored.push({ e, s })
  }
  scored.sort((a, b) => b.s - a.s || a.e.name.length - b.e.name.length)
  return scored.slice(0, limit).map((x) => x.e)
}
