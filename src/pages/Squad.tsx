import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Copy, RefreshCw, LogOut, Wifi, Globe, MapPin, Check } from 'lucide-react'
import { useGame } from '@/store/data'
import { useUI } from '@/store/ui'
import { useLauncher, type LauncherState } from '@/lib/pywebview'
import { makeRoomCode, ROOM_RE } from '@/lib/squad'
import { Eyebrow, Toggle, Empty } from '@/components/ui'

type Mode = 'idle' | 'join'

/** Лобби сквада: создать / войти, код крупно, участники, настройки хоста без правки конфига. */
export function SquadPage() {
  const data = useGame()
  const launcher = useLauncher()
  const squad = useUI((s) => s.squad)
  const setSquad = useUI((s) => s.setSquad)
  const members = useUI((s) => s.squadMembers)
  const connected = useUI((s) => s.squadConnected)
  const squadMap = useUI((s) => s.squadMap)
  const marks = useUI((s) => s.squadMarks)
  const [mode, setMode] = useState<Mode>('idle')
  const [joinCode, setJoinCode] = useState('')
  const [joinUrl, setJoinUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [state, setState] = useState<LauncherState | null>(null)
  const [busy, setBusy] = useState<'lan' | 'tunnel' | null>(null)

  useEffect(() => {
    if (!launcher) return
    const poll = () => launcher.get_state().then(setState).catch(() => {})
    poll()
    const t = setInterval(poll, 4000)
    return () => clearInterval(t)
  }, [launcher])

  const inRoom = !!squad.room && ROOM_RE.test(squad.room)
  const isHost = inRoom && !squad.url
  const hostUrl = state?.tunnel_url || state?.lan_url || null
  const invite = inRoom ? `Sherpa · комната ${squad.room}${isHost ? (hostUrl ? ` · хост ${hostUrl}` : ' · хост: включи LAN или туннель') : ` · хост ${squad.url}`}` : ''
  const mapNames = Object.fromEntries(Object.values(data.maps).map((m) => [m.normalizedName, m.name]))
  const others = Object.entries(members).filter(([n]) => n !== squad.name)

  const create = () => setSquad({ room: makeRoomCode(), url: '' })
  const join = () => { if (ROOM_RE.test(joinCode.trim())) { setSquad({ room: joinCode.trim(), url: joinUrl.trim() }); setMode('idle') } }
  const leave = () => setSquad({ room: '', url: '' })
  const copy = async () => { try { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }
  const toggleLan = async (on: boolean) => { if (!launcher?.enable_lan) return; setBusy('lan'); try { setState(await launcher.enable_lan(on)) } finally { setBusy(null) } }
  const toggleTunnel = async (on: boolean) => { if (!launcher?.enable_tunnel) return; setBusy('tunnel'); try { setState(await launcher.enable_tunnel(on)) } finally { setBusy(null) } }

  return (
    <div className="p-5 max-w-[1000px] mx-auto flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] text-ink">Сквад</h1>
          <div className="mt-1 text-[13px] text-ink-3">Позиции друзей, общая карта и метки — через лаунчер одного из вас. Комната живёт, пока хост запущен.</div>
        </div>
        {inRoom && <span className={`chip ${connected ? 'chip-on' : ''}`}>{connected ? 'на связи' : 'нет связи'}</span>}
      </header>

      <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
        {/* комната */}
        <section className="panel p-4 flex flex-col gap-3">
          <Eyebrow>Комната</Eyebrow>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            Ник
            <input value={squad.name} onChange={(e) => setSquad({ name: e.target.value.slice(0, 24) })} placeholder="Как тебя видят друзья" className="input focus:input-focus h-8 text-[13px] flex-1" />
          </label>

          {!inRoom && mode === 'idle' && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={create} className="chip chip-on"><Users size={12} /> Создать комнату</button>
              <button type="button" onClick={() => setMode('join')} className="chip hover:text-ink"><LogOut size={12} className="rotate-180" /> Войти по коду</button>
            </div>
          )}
          {!inRoom && mode === 'join' && (
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); join() }}>
              <input autoFocus value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Код комнаты" spellCheck={false} className="input focus:input-focus num h-9 text-[15px] tracking-[.2em]" />
              <input value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} placeholder="Адрес хоста: http://192.168… или https://…trycloudflare.com" spellCheck={false} className="input focus:input-focus num h-8 text-[12px]" />
              <div className="flex gap-2">
                <button type="submit" disabled={!ROOM_RE.test(joinCode.trim())} className="chip chip-on disabled:opacity-50"><Check size={12} /> Войти</button>
                <button type="button" onClick={() => setMode('idle')} className="chip">Отмена</button>
              </div>
            </form>
          )}

          {inRoom && (
            <>
              <div className="stash-grid rounded-md border border-line p-4 text-center">
                <div className="eyebrow">{isHost ? 'ты — хост' : 'подключён к хосту'}</div>
                <div className="num text-[40px] tracking-[.25em] text-brass-2 leading-none mt-1 select-all">{squad.room}</div>
                <div className="mt-2 text-[12px] text-ink-3 num truncate">{isHost ? (hostUrl ?? 'включи LAN или туннель справа →') : squad.url}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copy} className="chip chip-on"><Copy size={12} /> {copied ? 'Скопировано' : 'Скопировать приглашение'}</button>
                {isHost && <button type="button" onClick={create} className="chip hover:text-ink" title="Новый код — старая комната забудется"><RefreshCw size={12} /> Новый код</button>}
                <button type="button" onClick={leave} className="chip hover:text-danger hover:border-danger/60"><LogOut size={12} /> Выйти</button>
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                <Toggle value={squad.share} onChange={(v) => setSquad({ share: v })} label="Делиться своей позицией" />
                <Toggle value={squad.followMap} onChange={(v) => setSquad({ followMap: v })} label="Общая карта: один выбрал — у всех" />
              </div>
            </>
          )}
        </section>

        {/* хост */}
        <section className="panel p-4 flex flex-col gap-3">
          <Eyebrow>Хост</Eyebrow>
          {!launcher ? (
            <div className="text-[12px] text-ink-3 leading-5">Хостом может быть только Sherpa, запущенная через <span className="num">Sherpa.exe</span> / <span className="num">start.bat</span>. В браузере можно только войти к чужому хосту.</div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <Wifi size={16} className="mt-1 text-ink-3 shrink-0" />
                <div className="flex-1 min-w-0">
                  <Toggle value={!!state?.lan_url} onChange={toggleLan} label={busy === 'lan' ? 'Включаю…' : 'Одна Wi-Fi / локальная сеть'} />
                  <div className="mt-1 text-[12px] num text-ink-2 select-all truncate">{state?.lan_url ?? <span className="text-ink-4">адрес появится здесь</span>}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Globe size={16} className="mt-1 text-ink-3 shrink-0" />
                <div className="flex-1 min-w-0">
                  <Toggle value={state?.tunnel_state === 'up' || state?.tunnel_state === 'starting'} onChange={toggleTunnel} label={busy === 'tunnel' ? 'Включаю…' : 'Через интернет (туннель Cloudflare)'} />
                  <div className="mt-1 text-[12px] num text-ink-2 select-all truncate">
                    {state?.tunnel_state === 'up' && state.tunnel_url ? state.tunnel_url
                      : state?.tunnel_state === 'starting' ? <span className="text-ink-3">поднимаю туннель… (5–15 с)</span>
                      : state?.tunnel_state === 'missing' ? <span className="text-danger">нужен cloudflared: <span className="select-all">winget install --id Cloudflare.cloudflared</span></span>
                      : <span className="text-ink-4">публичный адрес появится здесь</span>}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-ink-4 leading-4">Настройки запоминаются и включатся при следующем запуске. Windows при первом включении может спросить про брандмауэр — разрешить. Туннельный адрес меняется при каждом запуске.</div>
            </>
          )}
        </section>
      </div>

      {/* участники */}
      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Участники · {inRoom ? others.length + 1 : 0}</Eyebrow>
          {inRoom && squadMap && <span className="text-[12px] text-ink-3 inline-flex items-center gap-1"><MapPin size={12} /> общая карта: {mapNames[squadMap] ?? squadMap}</span>}
        </div>
        {!inRoom ? (
          <div className="mt-2"><Empty title="Ты не в комнате" hint="Создай комнату или войди по коду от друга." /></div>
        ) : (
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            <li className="panel px-3 py-2 flex items-center gap-2 border-brass-3/50">
              <span className="w-2.5 h-2.5 rounded-full bg-brass" />
              <span className="text-ink truncate">{squad.name || 'без ника'}</span>
              <span className="ml-auto eyebrow">это ты</span>
            </li>
            {others.map(([name, m]) => {
              const age = Math.round((Date.now() - m.ts * 1000) / 1000)
              return (
                <li key={name} className={`panel px-3 py-2 flex items-center gap-2 ${!m.online ? 'opacity-50' : ''}`}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.pos ? '#5fd0d0' : '#6a706b' }} title={m.pos ? 'позиция есть' : 'без скриншотов'} />
                  <span className="text-ink truncate">{name}</span>
                  <span className="text-ink-3 truncate text-[12px]">{mapNames[m.map] ?? (m.map || '—')}</span>
                  <span className="ml-auto num text-ink-4 text-[12px]">{age < 60 ? `${age} с` : `${Math.round(age / 60)} мин`}</span>
                </li>
              )
            })}
            {others.length === 0 && <li className="text-[12px] text-ink-4 px-1 py-2">Пока никого — отправь приглашение.</li>}
          </ul>
        )}
        {inRoom && Object.keys(marks).length > 0 && (
          <div className="mt-3 text-[12px] text-ink-3">Общих меток: {Object.keys(marks).length} — <Link to="/maps" className="text-brass-2 hover:underline">на карте</Link></div>
        )}
      </section>

      <section className="text-[12px] text-ink-3 leading-5">
        <Eyebrow>Как это работает</Eyebrow>
        <ol className="mt-1 list-decimal pl-5 space-y-0.5">
          <li>Хост включает LAN (одна Wi-Fi) или туннель (интернет) и создаёт комнату.</li>
          <li>Друзья получают приглашение: код + адрес хоста. «Войти по коду» — и они в списке.</li>
          <li>Позиции обновляются с каждым скриншотом; карту переключает любой; правый клик по карте — общая метка.</li>
        </ol>
      </section>
    </div>
  )
}
