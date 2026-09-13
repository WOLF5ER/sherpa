import { useState } from 'react'
import { CloudDownload, ExternalLink } from 'lucide-react'
import { useGame } from '@/store/data'
import { useProfile } from '@/store/profile'
import { fetchTarkovTracker, mapProgress, tokenMode } from '@/lib/tarkovtracker'
import { ago } from '@/lib/format'
import { Eyebrow } from './ui'

const MODE_LABEL: Record<string, string> = { pvp: 'PvP', pve: 'PvE', seasonal: 'сезонный' }
const TT_TO_MODE: Record<string, 'regular' | 'pve' | 'pvp-season'> = { pvp: 'regular', pve: 'pve', seasonal: 'pvp-season' }

/** Подтянуть прогресс с tarkovtracker.org по API-токену. */
export function TarkovTrackerImport() {
  const data = useGame()
  const token = useProfile((s) => s.ttToken)
  const syncedAt = useProfile((s) => s.ttSyncedAt)
  const seasonal = useProfile((s) => s.seasonal)
  const gameMode = useProfile((s) => s.gameMode)
  const setToken = useProfile((s) => s.setTtToken)
  const applyImport = useProfile((s) => s.applyImport)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const mode = tokenMode(token)
  const modeMismatch = mode && TT_TO_MODE[mode] !== gameMode

  const run = async () => {
    if (!token) return
    setBusy(true)
    setMsg(null)
    try {
      const { data: prog, gameMode } = await fetchTarkovTracker(token)
      const r = mapProgress(data, prog, gameMode)
      applyImport({ level: r.level, faction: r.faction, completed: r.completed, stations: r.stations, ttSyncedAt: Date.now() })
      const n = Object.keys(r.completed).length
      const st = Object.keys(r.stations).length
      setMsg({
        ok: true,
        text: `Готово: уровень ${r.level}, ${r.faction}, ${n} выполненных квестов, ${st} станций схрона (${MODE_LABEL[r.gameMode] ?? r.gameMode})${r.unknownTasks ? ` · ${r.unknownTasks} квестов не найдено в справочнике` : ''}`,
      })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Импорт из TarkovTracker</Eyebrow>
        <a href="https://tarkovtracker.org/settings" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-brass-2">
          получить токен <ExternalLink size={11} />
        </a>
      </div>
      <div className="mt-2 text-[12px] text-ink-3 leading-5">
        Если ведёшь прогресс на tarkovtracker.org — в настройках создай API-токен с правом чтения и вставь сюда.
        Sherpa заберёт уровень, фракцию, выполненные квесты и уровни схрона. Токен хранится только на этом компьютере.
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={seasonal ? 'SZN_…' : 'PVP_… или PVE_…'}
          spellCheck={false}
          className="input focus:input-focus num text-[12px] w-72"
        />
        <button
          type="button"
          onClick={run}
          disabled={!token || busy}
          className="chip chip-on disabled:opacity-50"
        >
          <CloudDownload size={12} className={busy ? 'animate-pulse' : ''} />
          {busy ? 'Загружаю…' : 'Импортировать'}
        </button>
        {syncedAt && !msg && <span className="text-[12px] text-ink-3">синхронизировано {ago(syncedAt)}</span>}
      </div>
      {modeMismatch && (
        <div className="mt-2 text-[12px] text-brass">
          Токен {MODE_LABEL[mode!]}, а персонаж {seasonal ? 'сезонный' : gameMode === 'pve' ? 'PvE' : 'PvP'} — прогресс подтянется не в тот профиль. Переключи персонажа или возьми другой токен.
        </div>
      )}
      {msg && <div className={`mt-2 text-[12px] ${msg.ok ? 'text-fir' : 'text-danger'}`}>{msg.text}</div>}
    </div>
  )
}
