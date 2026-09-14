import { useEffect, useRef, useState } from 'react'
import { X, Copy, Wifi, Globe, Loader2 } from 'lucide-react'
import QRCode from 'qrcode'
import { useLauncher, type LauncherState } from '@/lib/pywebview'
import { Segmented } from './ui'

type Mode = 'lan' | 'tunnel'

/**
 * «Карта на телефоне»: телефон открывает страницу /live у лаунчера и едет за хостом.
 * В одной Wi-Fi — адрес локальной сети (порт +1), через интернет — туннель Cloudflare (тот же, что для сквада).
 */
export function PhoneDialog({ onClose }: { onClose: () => void }) {
  const launcher = useLauncher()
  const [state, setState] = useState<LauncherState | null>(null)
  const [mode, setMode] = useState<Mode>('lan')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!launcher) return
    const poll = () => launcher.get_state().then(setState).catch(() => {})
    poll()
    const t = setInterval(poll, 2000)
    return () => clearInterval(t)
  }, [launcher])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lanOn = !!state?.lan_url
  const tunnelOn = state?.tunnel_state === 'up' && !!state.tunnel_url
  const tunnelStarting = state?.tunnel_state === 'starting'
  const base = mode === 'lan' ? state?.lan_url : tunnelOn ? state?.tunnel_url : null
  const link = base ? `${base.replace(/\/+$/, '')}/#/live` : ''
  const on = mode === 'lan' ? lanOn : tunnelOn || tunnelStarting

  useEffect(() => {
    const c = canvasRef.current
    if (!c || !link) return
    QRCode.toCanvas(c, link, { width: 200, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }).catch(() => {})
  }, [link])

  const toggle = async () => {
    if (!launcher) return
    setBusy(true)
    try {
      if (mode === 'lan') setState(await launcher.enable_lan!(!lanOn))
      else if (launcher.enable_tunnel) setState(await launcher.enable_tunnel(!(tunnelOn || tunnelStarting)))
    } catch { /* ignore */ } finally { setBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="panel w-[560px] max-w-full p-5 shadow-[var(--shadow-pop)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="display text-[22px] text-ink">Карта на телефоне</div>
            <div className="mt-1 text-[13px] text-ink-2 leading-5">Наведи телефон на код — в его браузере откроется эта же карта и будет ехать за тобой: позиция со скриншотов, карта та, что открыта здесь, этаж по высоте.</div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-ink-3 hover:text-ink" aria-label="Закрыть"><X size={18} /></button>
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <Segmented value={mode} onChange={setMode} options={[
            { value: 'lan', label: <span className="inline-flex items-center gap-1.5"><Wifi size={12} /> Одна Wi-Fi</span> },
            { value: 'tunnel', label: <span className="inline-flex items-center gap-1.5"><Globe size={12} /> Через интернет</span> },
          ]} />
          <button type="button" onClick={toggle} disabled={busy || !launcher} className={`chip h-8 ${on ? 'hover:text-danger hover:border-danger/60' : 'chip-on'} disabled:opacity-60`}>
            {busy || tunnelStarting ? <Loader2 size={12} className="animate-spin" /> : null}
            {on ? 'Выключить' : 'Включить'}
          </button>
        </div>

        {link ? (
          <div className="mt-4 flex gap-4 items-start flex-wrap">
            <canvas ref={canvasRef} width={200} height={200} className="rounded-[4px] bg-white p-1 shrink-0" style={{ width: 200, height: 200 }} />
            <div className="min-w-0 flex-1 flex flex-col gap-2">
              <div className="eyebrow">{mode === 'lan' ? 'Адрес в этой Wi-Fi' : 'Адрес через интернет'}</div>
              <div className="num text-[12px] text-brass-2 break-all select-all">{link}</div>
              <button type="button" onClick={copy} className="chip self-start"><Copy size={12} /> {copied ? 'Скопировано' : 'Скопировать ссылку'}</button>
              <div className="text-[11px] text-ink-4 leading-4">
                {mode === 'lan'
                  ? 'Телефон должен быть в той же Wi-Fi, что и этот компьютер. Windows может спросить разрешение для брандмауэра — разреши.'
                  : 'Адрес публичный и случайный, живёт, пока запущена Sherpa; тот же адрес использует сквад через интернет.'}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 text-[13px] text-ink-3 leading-5">
            {mode === 'lan'
              ? (lanOn ? 'Не удалось определить адрес в сети — проверь подключение к Wi-Fi.' : 'Нажми «Включить» — лаунчер откроет доступ по локальной сети и покажет код.')
              : tunnelStarting ? 'Поднимаю туннель Cloudflare… обычно 5–10 секунд.'
                : state?.tunnel_state === 'missing' ? 'Туннель не запустился — проверь интернет; cloudflared идёт в комплекте или качается сам.'
                  : 'Нажми «Включить» — лаунчер поднимет публичный адрес через Cloudflare (без аккаунта) и покажет код.'}
          </div>
        )}

        <div className="mt-4 text-[12px] text-ink-3 leading-5">
          Ретранслирует лаунчер: пока Sherpa запущена и следит за папкой скриншотов, карта на телефоне живая. Позиция обновляется с каждым скриншотом, страница на телефоне опрашивает раз в 2 секунды.
        </div>
      </div>
    </div>
  )
}
