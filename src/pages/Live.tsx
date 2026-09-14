import { useEffect, useState } from 'react'
import { Link2Off, LocateFixed, Radio } from 'lucide-react'
import { useUI } from '@/store/ui'
import { useGame } from '@/store/data'
import type { PlayerPos } from '@/lib/pywebview'
import { ago } from '@/lib/format'
import { MapsPage } from './Maps'
import { ItemDrawer } from '@/components/ItemDrawer'
import { Lightbox } from '@/components/WikiPics'

/**
 * «Карта на телефоне» (/live): страница у лаунчера хоста, открытая на телефоне по QR-коду.
 * Раз в 2 секунды спрашивает /api/live — позиция со скриншотов и карта, открытая у хоста — и едет за ним.
 * Через туннель Cloudflare SSE не стримится, поэтому только опрос.
 */
interface Live { pos: PlayerPos | null; map: string; ts: number }

export function LivePage() {
  const data = useGame()
  const [hostMap, setHostMap] = useState<string | null>(null)
  const [follow, setFollow] = useState(true)
  const [status, setStatus] = useState<'connecting' | 'ok' | 'lost'>('connecting')
  const [lastSeen, setLastSeen] = useState<number | null>(null)
  const playerPos = useUI((s) => s.playerPos)
  const [, tick] = useState(0)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    let stop = false
    let fails = 0
    const poll = async () => {
      try {
        const r = await fetch('/api/live', { cache: 'no-store' })
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(String(r.status))
        const j = (await r.json()) as Live
        if (stop) return
        fails = 0
        setStatus('ok')
        setLastSeen(Date.now())
        if (j.map) setHostMap(j.map)
        const cur = useUI.getState().playerPos
        if (j.pos && (!cur || cur.ts !== j.pos.ts)) useUI.getState().setPlayerPos(j.pos)
      } catch {
        if (stop) return
        if (++fails >= 3) setStatus('lost')
      }
    }
    void poll()
    const t = setInterval(poll, 2000)
    const t2 = setInterval(() => tick((x) => x + 1), 5000)
    return () => { stop = true; clearInterval(t); clearInterval(t2) }
  }, [])
  // телефон только слушает: «карта следует за точкой» включаем
  useEffect(() => { useUI.getState().setFollowPlayer(true) }, [])

  const mapName = hostMap ? Object.values(data.maps).find((m) => m.normalizedName === hostMap)?.name ?? hostMap : null

  return (
    <div className="h-full relative isolate">
      <MapsPage standalone live={{ hostMap: follow ? hostMap : null }} />
      {/* строка состояния сверху: связь с хостом, карта, давность позиции */}
      <div className="absolute left-3 top-3 z-[500] panel glass px-3 py-1.5 flex items-center gap-2 text-[12px] max-w-[calc(100%-24px)] shadow-[0_10px_30px_rgba(0,0,0,.5)]">
        {status === 'ok' ? <Radio size={13} className="text-fir shrink-0" /> : <Link2Off size={13} className={`shrink-0 ${status === 'lost' ? 'text-danger' : 'text-ink-3'}`} />}
        <span className="text-ink-2 truncate">
          {status === 'connecting' ? 'Подключаюсь к Sherpa…' : status === 'lost' ? 'Нет связи с Sherpa — она запущена?' : mapName ? `Хост: ${mapName}` : 'Хост ещё не открыл карту'}
        </span>
        <span className="num text-ink-4 whitespace-nowrap">{playerPos ? ago(playerPos.ts) : lastSeen ? 'ждём скриншот' : ''}</span>
        <button type="button" onClick={() => setFollow(!follow)} title={follow ? 'Карта следует за хостом — выключить, чтобы выбрать свою' : 'Следовать за картой хоста'}
          className={`ml-1 h-6 w-6 grid place-items-center rounded-[3px] border shrink-0 ${follow ? 'border-brass-3 text-brass-2 bg-brass/10' : 'border-line-2 text-ink-3'}`}>
          <LocateFixed size={12} />
        </button>
      </div>
      <ItemDrawer />
      <Lightbox />
    </div>
  )
}
