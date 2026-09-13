import { useState } from 'react'
import { Users, Copy, RefreshCw } from 'lucide-react'
import { useUI } from '@/store/ui'
import { useLauncher } from '@/lib/pywebview'
import { makeRoomCode, makeInvite, ROOM_RE } from '@/lib/squad'
import { Link } from 'react-router-dom'
import { Eyebrow, Toggle } from './ui'

/** Сквад: комната на лаунчере-хосте, имя, кто где. */
export function SquadPanel({ currentMap, mapNames }: { currentMap: string; mapNames: Record<string, string> }) {
  const launcher = useLauncher()
  const squad = useUI((s) => s.squad)
  const setSquad = useUI((s) => s.setSquad)
  const members = useUI((s) => s.squadMembers)
  const connected = useUI((s) => s.squadConnected)
  const [copied, setCopied] = useState(false)

  const roomOk = ROOM_RE.test(squad.room)
  const others = Object.entries(members).filter(([n]) => n !== squad.name)
  const inviteBase = squad.url || (launcher ? '' : location.origin)
  const invite = inviteBase && roomOk ? makeInvite(inviteBase, squad.room) : ''

  return (
    <div>
      <div className="flex items-center justify-between">
        <Eyebrow>Сквад · <Link to="/squad" className="text-brass hover:underline normal-case tracking-normal">лобби</Link></Eyebrow>
        {squad.room && <span className={`text-[10px] tracking-[.1em] uppercase ${connected ? 'text-fir' : 'text-ink-4'}`}>{connected ? 'на связи' : 'нет связи'}</span>}
      </div>
      <div className="mt-1.5 flex flex-col gap-1.5">
        <input value={squad.name} onChange={(e) => setSquad({ name: e.target.value.slice(0, 24) })} placeholder="Твой ник" className="input focus:input-focus h-8 text-[12px]" />
        <div className="flex gap-1">
          <input value={squad.room} onChange={(e) => setSquad({ room: e.target.value.trim() })} placeholder="Код комнаты" spellCheck={false} className={`input focus:input-focus num h-8 text-[12px] flex-1 ${squad.room && !roomOk ? 'border-danger' : ''}`} />
          <button type="button" onClick={() => setSquad({ room: makeRoomCode() })} title="Новая комната" className="chip hover:text-ink"><RefreshCw size={12} /></button>
        </div>
        <input value={squad.url} onChange={(e) => setSquad({ url: e.target.value.trim() })} placeholder={launcher ? 'Адрес хоста (пусто — я хост)' : 'Адрес хоста: http://192.168… или https://…trycloudflare.com'} spellCheck={false} className="input focus:input-focus num h-8 text-[12px]" />
        <Toggle value={squad.share} onChange={(v) => setSquad({ share: v })} label="Делиться своей позицией" />
        <Toggle value={squad.followMap} onChange={(v) => setSquad({ followMap: v })} label="Общая карта: один выбрал — у всех" />
      </div>
      {squad.room && roomOk && (invite ? (
        <button
          type="button"
          onClick={async () => { try { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }}
          className="mt-1.5 chip hover:text-ink"
        >
          <Copy size={12} /> {copied ? 'Скопировано' : 'Скопировать приглашение'}
        </button>
      ) : (
        <Link to="/squad" className="mt-1.5 chip hover:text-ink"><Copy size={12} /> Приглашение — в лобби</Link>
      ))}
      <div className="mt-1 text-[11px] text-ink-3 leading-4">
        Правый клик по карте в скваде — общая метка, видна всем с твоим ником. Хост — лаунчер одного из вас: LAN (одна Wi-Fi) или туннель через интернет включаются в <Link to="/squad" className="text-brass hover:underline">лобби</Link>, ничего ставить не нужно. Друзья вводят адрес хоста и тот же код комнаты.
      </div>

      {squad.room && (
        <ul className="mt-2 flex flex-col gap-1">
          {others.length === 0 && <li className="text-[11px] text-ink-4 inline-flex items-center gap-1"><Users size={11} /> Пока никого</li>}
          {others.map(([name, m]) => {
            const age = Math.round((Date.now() - m.ts * 1000) / 1000)
            const here = m.map === currentMap
            return (
              <li key={name} className={`panel px-2 py-1.5 text-[12px] flex items-center gap-2 ${!m.online ? 'opacity-50' : ''}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: here ? '#5fd0d0' : '#6a706b' }} />
                <span className="text-ink truncate">{name}</span>
                <span className="text-ink-3 truncate">{mapNames[m.map] ?? m.map ?? '—'}</span>
                <span className="ml-auto num text-ink-4">{age < 60 ? `${age} с` : `${Math.round(age / 60)} мин`}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
