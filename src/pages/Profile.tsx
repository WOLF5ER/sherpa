import { useMemo, useRef } from 'react'
import { Download, Upload, Trash2, DatabaseZap, RefreshCw, ExternalLink, Sparkles } from 'lucide-react'
import { useGame, useData } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useUI } from '@/store/ui'
import { fmtMinutes, scavCooldown } from '@/lib/scav'
import { clearCache } from '@/data/loader'
import { deriveTraderLevel } from '@/lib/useCtx'
import { Eyebrow, Progress, Segmented, Stepper } from '@/components/ui'
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
  const cd = scavCooldown(data, p.stations, p.fenceRep)

  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const exportJson = async () => {
    const text = JSON.stringify({
      name: p.name, level: p.level, faction: p.faction, gameMode: p.gameMode, seasonal: p.seasonal, fleaDisabled: p.fleaDisabled,
      completed: p.completed, stations: p.stations, have: p.have, traderLevels: p.traderLevels, fenceRep: p.fenceRep, achievements: p.achievements,
      objectivesDone: p.objectivesDone, skills: p.skills,
    }, null, 2)
    const name = `sherpa-profile-${new Date().toISOString().slice(0, 10)}.json`
    // в лаунчере (WebView2) скачивание blob-ссылок не работает — просим лаунчер показать «Сохранить как»
    if (launcher?.save_file) {
      const path = await launcher.save_file(name, text).catch(() => null)
      setExportMsg(path ? `Сохранено: ${path}` : null)
      return
    }
    const blob = new Blob([text], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
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
        objectivesDone: j.objectivesDone ?? {}, skills: j.skills ?? {}, fenceRep: typeof j.fenceRep === 'number' ? j.fenceRep : 0,
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

      <UpdatePanel />

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
        <div className="flex items-baseline justify-between">
          <Eyebrow>Скупщик и кулдаун дикого</Eyebrow>
          <span className="text-[12px] text-ink-3">База {fmtMinutes(cd.base)}; разведцентр и репутация уменьшают</span>
        </div>
        <div className="mt-3 panel px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            Репутация у Скупщика
            <input
              type="number" step={0.01} min={-10} max={10} value={p.fenceRep}
              onChange={(e) => p.setFenceRep(Number(e.target.value))}
              className="input focus:input-focus h-8 w-24 text-[12px] num"
            />
          </label>
          <div className="text-[12px] text-ink-3">
            Кулдаун дикого: <span className="num text-ink">{fmtMinutes(cd.seconds)}</span>
            {cd.hideout > 0 && <> · разведцентр <span className="num">−{Math.round(cd.hideout * 100)}%</span></>}
            {cd.fence !== 1 && <> · Скупщик от <span className="num">{cd.fenceRep}</span> → <span className="num">×{cd.fence}</span></>}
            {cd.hideout === 0 && cd.fence === 1 && ' · без скидок'}
          </div>
        </div>
      </section>

      <section>
        <TarkovTrackerImport />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="panel p-4">
          <div className="flex items-baseline justify-between gap-2">
            <Eyebrow>Оверлей</Eyebrow>
            <VersionLine />
          </div>
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
                : tunnel.state === 'missing' ? <>туннель не запустился — проверь интернет; cloudflared идёт в комплекте или качается автоматически.</>
                : <>в <span className="num">launcher/config.json</span> поставь <span className="num">"squad_tunnel": true</span> — лаунчер создаст публичный адрес через Cloudflare (без аккаунта).</>}
            </div>
          )}
        </div>
        <div className="panel p-4">
          <Eyebrow>Резервная копия</Eyebrow>
          <div className="mt-3 text-[13px] text-ink-2 num">{p.name}: {doneCount} выполненных квестов · {Object.keys(p.have).length} предметов в счётчиках</div>
          <div className="mt-1 text-[12px] text-ink-3">Экспорт — файл Sherpa, чтобы перенести прогресс в лаунчер, на другой ПК или другому персонажу.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void exportJson()} className="chip hover:text-ink hover:border-ink-4"><Upload size={12} /> Экспорт профиля</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="chip hover:text-ink hover:border-ink-4"><Download size={12} /> Импорт</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = '' }} />
            <button type="button" onClick={async () => { await clearCache(p.gameMode); void load(p.gameMode) }} className="chip hover:text-ink hover:border-ink-4"><DatabaseZap size={12} /> Перекачать справочник</button>
            <button type="button" onClick={() => { if (confirm(`Стереть прогресс персонажа «${p.name}»: квесты, схрон, счётчики?`)) p.reset() }} className="chip hover:text-danger hover:border-danger/60"><Trash2 size={12} /> Сбросить прогресс</button>
          </div>
          {exportMsg && <div className="mt-2 text-[12px] text-fir">{exportMsg}</div>}
        </div>
      </section>
    </div>
  )
}

/** Версия и ручная проверка обновлений (в лаунчере); в браузере — просто версия. */
function VersionLine() {
  const launcher = useLauncher()
  const info = useUI((s) => s.updateInfo)
  const checking = info?.state.stage === 'checking'
  return (
    <span className="num text-[11px] text-ink-4 inline-flex items-center gap-2">
      Sherpa {info?.version ?? __APP_VERSION__}
      {launcher?.check_update && !info?.update && (
        <button type="button" onClick={() => launcher.check_update?.().then((u) => useUI.getState().setUpdateInfo(u)).catch(() => {})} disabled={checking}
          className="inline-flex items-center gap-1 text-ink-4 hover:text-ink-2 disabled:opacity-60" title={info?.checked_at ? `Проверено ${new Date(info.checked_at * 1000).toLocaleTimeString('ru-RU')}` : 'Проверить обновления'}>
          <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />{checking ? 'проверяю…' : info?.checked_at ? 'последняя' : 'проверить'}
        </button>
      )}
      {info?.state.stage === 'error' && !info.update && <span className="text-danger normal-case" title={info.state.error}>не проверилось</span>}
    </span>
  )
}

/** Найдено обновление: что нового, размер, «Установить и перезапустить». Ставится только в собранной Sherpa.exe. */
function UpdatePanel() {
  const launcher = useLauncher()
  const info = useUI((s) => s.updateInfo)
  if (!info?.update) return null
  const u = info.update
  const st = info.state
  const busy = st.stage === 'downloading' || st.stage === 'extracting' || st.stage === 'restarting'
  const pct = st.stage === 'downloading' && st.total ? (st.done ?? 0) / st.total : null
  const mb = (u.size / 1024 / 1024).toFixed(0)
  const openPage = () => { if (launcher?.open_url) void launcher.open_url(u.page); else window.open(u.page, '_blank') }
  return (
    <section className="panel p-4 border-brass-3 bg-brass/5">
      <div className="flex items-start gap-3 flex-wrap">
        <Sparkles size={18} className="text-brass-2 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="display text-[18px] text-ink">Доступна Sherpa {u.version}</div>
          <div className="mt-0.5 text-[12px] text-ink-3">Сейчас {info.version} · архив {mb} МБ{u.published ? ` · ${new Date(u.published).toLocaleDateString('ru-RU')}` : ''}. Прогресс и настройки останутся: они лежат отдельно от программы.</div>
          {u.notes && (
            <div className="mt-2 text-[12px] text-ink-2 leading-5 max-h-48 overflow-y-auto flex flex-col gap-0.5">
              {notesLines(u.notes).map((l, i) => l.kind === 'h' ? <div key={i} className="eyebrow mt-1.5">{l.text}</div> : l.kind === 'li' ? <div key={i} className="pl-3">• {l.text}</div> : <div key={i}>{l.text}</div>)}
            </div>
          )}
          {busy && (
            <div className="mt-3">
              <div className="text-[12px] text-ink-2">{st.stage === 'downloading' ? `Скачиваю… ${pct != null ? Math.round(pct * 100) : 0}%` : st.stage === 'extracting' ? 'Распаковываю…' : 'Перезапускаюсь — окно закроется и откроется снова через несколько секунд'}</div>
              <Progress value={st.stage === 'downloading' ? (pct ?? 0) : 1} className="mt-1.5" />
            </div>
          )}
          {st.stage === 'error' && <div className="mt-2 text-[12px] text-danger">Не вышло: {st.error}. Скачай архив со страницы релиза и распакуй поверх папки Sherpa.</div>}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {info.can_install && launcher?.install_update ? (
            <button type="button" disabled={busy} onClick={() => void launcher.install_update?.()} className="chip chip-on h-8 disabled:opacity-60"><Download size={12} /> {busy ? 'Обновляю…' : 'Установить и перезапустить'}</button>
          ) : (
            <div className="text-[11px] text-ink-4 max-w-[200px]">Автоустановка — только в Sherpa.exe. В браузере или из исходников — <span className="num">git pull</span> и пересборка.</div>
          )}
          <button type="button" onClick={openPage} className="chip hover:text-ink hover:border-ink-4 h-8"><ExternalLink size={12} /> Страница релиза</button>
        </div>
      </div>
    </section>
  )
}

/** Заметки релиза — markdown с GitHub; рисуем самое простое: заголовки, пункты, абзацы. Ссылки на PR/коммиты выкидываем. */
function notesLines(md: string): { kind: 'h' | 'li' | 'p'; text: string }[] {
  const out: { kind: 'h' | 'li' | 'p'; text: string }[] = []
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[(.+?)\]\((.+?)\)/g, '$1').replace(/\s+by @\S+ in \S+$/, '').replace(/\s+in https?:\/\/\S+$/, '').trim()
    if (!line) continue
    if (/^#+\s/.test(line)) out.push({ kind: 'h', text: line.replace(/^#+\s*/, '') })
    else if (/^[-*]\s/.test(line)) out.push({ kind: 'li', text: line.replace(/^[-*]\s*/, '') })
    else if (/^\*\*Full Changelog\*\*|^Full Changelog/i.test(line)) continue
    else out.push({ kind: 'p', text: line })
  }
  return out
}
