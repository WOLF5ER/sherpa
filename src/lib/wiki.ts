/**
 * Картинки с вики (escapefromtarkov.fandom.com) для пунктов сезонных квестов: карта с отметкой и скрины места.
 * Имена файлов лежат в данных (Objective.pics), адреса берём через MediaWiki API (CORS открыт, origin=*),
 * кэшируем в localStorage. Хотлинк со static.wikia.nocookie.net с чужим Referer отдаёт заглушку 300×171 — картинки грузим с referrerPolicy="no-referrer".
 */

const API = 'https://escapefromtarkov.fandom.com/api.php'
const CACHE_KEY = 'sherpa:wikiImg:v1'

let cache: Record<string, string> | null = null
const pending = new Map<string, Promise<Record<string, string>>>()

function load(): Record<string, string> {
  if (cache) return cache
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') } catch { cache = {} }
  return cache!
}
function save() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache ?? {})) } catch { /* ignore */ } }

/** file → полный url оригинала (с /revision/latest?cb=…) */
export async function wikiImageUrls(files: string[]): Promise<Record<string, string>> {
  const c = load()
  const missing = files.filter((f) => !c[f])
  if (missing.length) {
    const key = missing.slice().sort().join('|')
    let p = pending.get(key)
    if (!p) {
      p = (async () => {
        const titles = missing.map((f) => 'File:' + f).join('|')
        const url = `${API}?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url&format=json&origin=*`
        const r = await fetch(url)
        const d = await r.json()
        const out: Record<string, string> = {}
        // MediaWiki приводит первую букву к заглавной («skill_x.png» → «Skill_x.png») — возвращаем под тем именем, что просили
        const back: Record<string, string> = {}
        for (const n of (d?.query?.normalized ?? []) as { from: string; to: string }[]) back[String(n.to).replace(/^File:/, '').replace(/ /g, '_')] = String(n.from).replace(/^File:/, '').replace(/ /g, '_')
        for (const p of Object.values<any>(d?.query?.pages ?? {})) {
          const u = p?.imageinfo?.[0]?.url
          if (!u || !p.title) continue
          const t = String(p.title).replace(/^File:/, '').replace(/ /g, '_')
          out[back[t] ?? t] = u
        }
        Object.assign(c, out); save()
        return out
      })().finally(() => pending.delete(key))
      pending.set(key, p)
    }
    await p.catch(() => { /* без сети — покажем что есть */ })
  }
  return Object.fromEntries(files.filter((f) => c[f]).map((f) => [f, c[f]]))
}

/** уменьшенная копия (ширина в px) — CDN вики режет по пути /scale-to-width-down/N */
export function wikiThumb(url: string, width: number): string {
  return url.replace('/revision/latest', `/revision/latest/scale-to-width-down/${width}`)
}

export const WIKI_CREDIT = 'картинки: escapefromtarkov.fandom.com (CC BY-NC-SA)'
