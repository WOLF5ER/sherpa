import { useMemo, useRef } from 'react'
import { Download, Upload, Trash2, DatabaseZap } from 'lucide-react'
import { useGame, useData } from '@/store/data'
import { useProfile } from '@/store/profile'
import { clearCache } from '@/data/loader'
import { deriveTraderLevel } from '@/lib/useCtx'
import { Eyebrow, Segmented, Stepper } from '@/components/ui'
import { ProfileSwitcher } from '@/components/ProfileSwitcher'
import { TarkovTrackerImport } from '@/components/TarkovTrackerImport'
import { useLauncher } from '@/lib/pywebview'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export function ProfilePage() {
  const data = useGame()
  const p = useProfile()
  const load = useData((s) => s.load)
  const fileRef = useRef<HTMLInputElement>(null)
  const launcher = useLauncher()
  const [lanUrl, setLanUrl] = useState<string | null>(null)
  const [tunnel, setTunnel] = useState<{ url: string | null; state: string }>({ url: null, state: 'off' })
  useEffect(() => {
    if (!launcher) return
    const poll = () => launcher.get_state().then((s) => { setLanUrl(s.lan_url ?? null); setTunnel({ url: s.tunnel_url ?? null, state: s.tunnel_state ?? 'off' }) }).catch(() => {})
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [launcher])

  const stations = useMemo(() => Object.values(data.stations).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [data])
  const traders = useMemo(() => Object.values(data.traders).filter((t) => t.levels.length > 1), [data])
  const doneCount = Object.keys(p.completed).length

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({
      name: p.name, level: p.level, faction: p.faction, gameMode: p.gameMode, seasonal: p.seasonal, fleaDisabled: p.fleaDisabled,
      completed: p.completed, stations: p.stations, have: p.have, traderLevels: p.traderLevels, achievements: p.achievements,
    }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sherpa-profile-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = async (f: File) => {
    try {
      const j = JSON.parse(await f.text())
      useProfile.setState({
        name: j.name ?? p.name, level: j.level ?? p.level, faction: j.faction ?? p.faction, gameMode: j.gameMode ?? p.gameMode,
        seasonal: !!j.seasonal, fleaDisabled: !!j.fleaDisabled, achievements: j.achievements ?? {},
        completed: j.completed ?? {}, stations: j.stations ?? {}, have: j.have ?? {}, traderLevels: j.traderLevels ?? {},
      })
    } catch {
      alert('Файл не похож на профиль Sherpa')
    }
  }

  return (
    <div className="p-5 max-w-[1000px] mx-auto flex flex-col gap-8">
      <header>
        <h1 className="display text-[34px] text-ink">Профиль</h1>
        <div className="mt-1 text-[13px] text-ink-3">Всё хранится только на этом компьютере. Уровень и выполненные квесты определяют, что показывать в «Задачах» и «Предметах».</div>
      </header>

      <section className="panel p-4">
        <ProfileSwitcher />
        <div className="mt-3 text-[12px] text-ink-3">У каждого персонажа свой прогресс: квесты, схрон, счётчики. Сезонные модификаторы — в разделе <Link to="/season" className="text-brass-2 hover:underline">Сезон</Link>.</div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="panel p-4">
          <Eyebrow>Уровень ЧВК</Eyebrow>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="number" min={1} max={79} value={p.level}
              onChange={(e) => p.setLevel(Number(e.target.value))}
              className="input focus:input-focus num w-24 text-[22px] h-12 text-center"
            />
            <input type="range" min={1} max={79} value={p.level} onChange={(e) => p.setLevel(Number(e.target.value))} className="flex-1" />
          </div>
        </div>
        <div className="panel p-4">
          <Eyebrow>Фракция</Eyebrow>
          <div className="mt-3"><Segmented value={p.faction} onChange={p.setFaction} options={[{ value: 'USEC', label: 'USEC' }, { value: 'BEAR', label: 'BEAR' }]} /></div>
          <div className="mt-2 text-[12px] text-ink-3">Скрывает квесты другой фракции.</div>
        </div>
        <div className="panel p-4">
          <Eyebrow>Режим игры</Eyebrow>
          <div className="mt-3"><Segmented value={p.gameMode} onChange={(m) => { p.setGameMode(m); void load(m) }} options={[{ value: 'regular', label: 'PvP' }, { value: 'pvp-season', label: 'Сезон' }, { value: 'pve', label: 'PvE' }]} /></div>
          <div className="mt-2 text-[12px] text-ink-3">Свой у каждого персонажа. У сезона и PvE своя барахолка; PvE-выходы в PvP не показываются, и наоборот.</div>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Схрон — текущие уровни станций</Eyebrow>
          <span className="text-[12px] text-ink-3">Влияет на «Предметы» и доступность крафтов</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((s) => {
            const max = Math.max(...s.levels.map((l) => l.level))
            const cur = p.stations[s.id] ?? 0
            return (
              <div key={s.id} className="panel px-3 py-2 flex items-center gap-3">
                <img src={s.imageLink} alt="" className="w-8 h-8 object-contain opacity-90" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink truncate">{s.name}</div>
                  <div className="num text-[11px] text-ink-3">{cur} / {max}</div>
                </div>
                <Stepper value={cur} min={0} max={max} onChange={(v) => p.setStation(s.id, v)} />
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Торговцы — уровень лояльности</Eyebrow>
          <span className="text-[12px] text-ink-3">По умолчанию считается от уровня ЧВК; репутацию не учитываем</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {traders.map((t) => {
            const auto = deriveTraderLevel(t.levels, p.level)
            const manual = p.traderLevels[t.id]
            return (
              <div key={t.id} className="panel px-3 py-2 flex items-center gap-3">
                <img src={t.imageLink} alt="" className="w-8 h-8 rounded-[3px] object-cover" />
                <div className="flex-1 min-w-0 text-[13px] text-ink truncate">{t.name}</div>
                <select
                  value={manual ?? 0}
                  onChange={(e) => p.setTraderLevel(t.id, Number(e.target.value) || null)}
                  className="input focus:input-focus h-8 w-24 text-[12px]"
                >
                  <option value={0}>авто ({auto})</option>
                  {t.levels.map((l) => <option key={l.level} value={l.level}>ур. {l.level}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <TarkovTrackerImport />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="panel p-4">
          <Eyebrow>Оверлей</Eyebrow>
          <div className="mt-3 text-[12px] text-ink-3 leading-5">
            Лаунчер (<span className="num">start.bat</span>) открывает Sherpa отдельным окном поверх игры.<br />
            <span className="num text-ink-2">F10</span> — показать/скрыть, <span className="num text-ink-2">F9</span> — поверх всех окон. В игре нужен режим «Без рамки» (Borderless).
          </div>
          {launcher && (
            <div className="mt-3 text-[12px] text-ink-3 leading-5">
              <span className="text-ink-2">Телефон / планшет:</span>{' '}
              {lanUrl
                ? <>открой <span className="num text-brass-2 select-all">{lanUrl}</span> в той же Wi-Fi — карта и «ты здесь» будут и там.</>
                : <>в <span className="num">launcher/config.json</span> поставь <span className="num">"lan": true</span> и перезапусти — здесь появится адрес для телефона.</>}
            </div>
          )}
          {launcher && (
            <div className="mt-2 text-[12px] text-ink-3 leading-5">
              <span className="text-ink-2">Сквад через интернет:</span>{' '}
              {tunnel.state === 'up' && tunnel.url
                ? <>адрес для друзей — <span className="num text-brass-2 select-all">{tunnel.url}</span> (живёт, пока запущен лаунчер).</>
                : tunnel.state === 'starting' ? 'поднимаю туннель…'
                : tunnel.state === 'missing' ? <>нужен cloudflared: <span className="num select-all">winget install --id Cloudflare.cloudflared</span>, затем перезапуск.</>
                : <>в <span className="num">launcher/config.json</span> поставь <span className="num">"squad_tunnel": true</span> — лаунчер создаст публичный адрес через Cloudflare (без аккаунта).</>}
            </div>
          )}
        </div>
        <div className="panel p-4">
          <Eyebrow>Резервная копия</Eyebrow>
          <div className="mt-3 text-[13px] text-ink-2 num">{p.name}: {doneCount} выполненных квестов · {Object.keys(p.have).length} предметов в счётчиках</div>
          <div className="mt-1 text-[12px] text-ink-3">Экспорт — файл Sherpa, чтобы перенести прогресс в лаунчер, на другой ПК или другому персонажу.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={exportJson} className="chip hover:text-ink hover:border-ink-4"><Download size={12} /> Экспорт профиля</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="chip hover:text-ink hover:border-ink-4"><Upload size={12} /> Импорт</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = '' }} />
            <button type="button" onClick={async () => { await clearCache(p.gameMode); void load(p.gameMode) }} className="chip hover:text-ink hover:border-ink-4"><DatabaseZap size={12} /> Перекачать справочник</button>
            <button type="button" onClick={() => { if (confirm(`Стереть прогресс персонажа «${p.name}»: квесты, схрон, счётчики?`)) p.reset() }} className="chip hover:text-danger hover:border-danger/60"><Trash2 size={12} /> Сбросить прогресс</button>
          </div>
        </div>
      </section>
    </div>
  )
}
