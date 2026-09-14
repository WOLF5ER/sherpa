import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { wikiImageUrls, wikiThumb, WIKI_CREDIT } from '@/lib/wiki'

/** Картинки с вики к пункту квеста: превью в ряд, клик — на весь экран. */
export function WikiPics({ files, size = 96, className = '' }: { files: string[]; size?: number; className?: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => { let on = true; void wikiImageUrls(files).then((u) => { if (on) setUrls(u) }); return () => { on = false } }, [files])
  const list = files.filter((f) => urls[f])
  if (!list.length) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} title={WIKI_CREDIT}>
      {list.map((f) => (
        <button key={f} type="button" onClick={() => openLightbox(urls[f])} className="rounded-[3px] border border-line-2 overflow-hidden hover:border-brass" style={{ width: size, height: Math.round(size * 9 / 16) }}>
          <img src={wikiThumb(urls[f], size * 2)} alt="" loading="lazy" className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
  )
}

/** То же для попапов Leaflet (голый DOM). */
export function renderWikiPics(container: HTMLElement, files: string[], size = 88) {
  void wikiImageUrls(files).then((urls) => {
    const list = files.filter((f) => urls[f])
    if (!list.length) return
    const row = document.createElement('div')
    row.className = 'qpop-pics'
    row.title = WIKI_CREDIT
    for (const f of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'qpop-pic'
      b.style.width = `${size}px`; b.style.height = `${Math.round(size * 9 / 16)}px`
      const img = document.createElement('img'); img.src = wikiThumb(urls[f], size * 2); img.alt = ''; img.loading = 'lazy'
      b.appendChild(img)
      b.onclick = (e) => { e.stopPropagation(); openLightbox(urls[f]) }
      row.appendChild(b)
    }
    container.appendChild(row)
  })
}

export function openLightbox(url: string) {
  window.dispatchEvent(new CustomEvent('sherpa:lightbox', { detail: url }))
}

/** Просмотр картинки на весь экран; монтируется один раз в App. */
export function Lightbox() {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const on = (e: Event) => setUrl((e as CustomEvent<string>).detail)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setUrl(null) }
    window.addEventListener('sherpa:lightbox', on)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('sherpa:lightbox', on); window.removeEventListener('keydown', key) }
  }, [])
  if (!url) return null
  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4" onClick={() => setUrl(null)}>
      <img src={wikiThumb(url, 1600)} alt="" className="max-w-full max-h-full object-contain rounded shadow-[var(--shadow-pop)]" />
      <button type="button" onClick={() => setUrl(null)} className="absolute top-3 right-3 p-2 text-ink-2 hover:text-ink" aria-label="Закрыть"><X size={22} /></button>
      <div className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-ink-4">{WIKI_CREDIT}</div>
    </div>
  )
}
