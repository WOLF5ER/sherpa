import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ListChecks, Backpack, Coins, FlaskConical, Map as MapIcon, UserRound, Search, RefreshCw, PictureInPicture2, Pin, Medal, Crosshair, Warehouse, Target, Timer, Wrench, Sun, Moon, Radar, Users, KeyRound, Footprints, Dumbbell, Download, Smartphone,
} from 'lucide-react'
import { PhoneDialog } from './PhoneDialog'
import { useLauncher, useOnTop } from '@/lib/pywebview'
import { MODE_LABEL, type GameMode } from '@/data/loader'
import { useData } from '@/store/data'
import { useProfile } from '@/store/profile'
import { useUI } from '@/store/ui'
import { ago } from '@/lib/format'
import { Kbd } from './ui'
import { ItemDrawer } from './ItemDrawer'
import { SearchPalette } from './SearchPalette'
import { Lightbox } from './WikiPics'

const NAV = [
  { to: '/raid', label: 'Брифинг', icon: Crosshair },
  { to: '/tasks', label: 'Задачи', icon: ListChecks },
  { to: '/needs', label: 'Предметы', icon: Backpack },
  { to: '/keys', label: 'Ключи', icon: KeyRound },
  { to: '/hideout', label: 'Схрон', icon: Warehouse },
  { to: '/market', label: 'Барахолка', icon: Coins },
  { to: '/crafts', label: 'Крафты', icon: FlaskConical },
  { to: '/ammo', label: 'Патроны', icon: Target },
  { to: '/builder', label: 'Сборка', icon: Wrench },
  { to: '/skills', label: 'Навыки', icon: Dumbbell },
  { to: '/maps', label: 'Карты', icon: MapIcon },
  { to: '/raids', label: 'Рейды', icon: Footprints },
  { to: '/squad', label: 'Сквад', icon: Users },
  { to: '/season', label: 'Сезон', icon: Medal },
  { to: '/profile', label: 'Профиль', icon: UserRound },
]

export function Shell() {
  const overlay = useUI((s) => s.overlay)
  const setOverlay = useUI((s) => s.setOverlay)
  const setPalette = useUI((s) => s.setPalette)
  const loc = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
      if (e.key === 'Escape') { useUI.getState().closeItem(); setPalette(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette])

  const isMap = loc.pathname.startsWith('/maps')

  return (
    <div className={`h-full flex ${overlay ? 'overlay' : ''}`}>
      {!overlay && (
        <nav className="w-[84px] shrink-0 flex flex-col border-r border-line bg-bg-1">
          <div className="h-14 grid place-items-center border-b border-line">
            <Logo />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col py-1.5 [scrollbar-width:none]">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative shrink-0 flex flex-col items-center gap-0.5 py-1 text-[10px] font-display uppercase tracking-[.1em] transition-colors
                   ${isActive ? 'text-brass-2' : 'text-ink-3 hover:text-ink'}`}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-brass rounded-r" />}
                    <Icon size={20} strokeWidth={1.8} />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
          <LevelBadge />
        </nav>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className={`shrink-0 flex items-center gap-3 px-4 border-b border-line bg-bg-1 ${overlay ? 'h-10' : 'h-14'}`}>
          {overlay && <Logo small />}
          {overlay && (
            <div className="flex gap-1">
              {NAV.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} title={label} className={({ isActive }) => `p-1.5 rounded ${isActive ? 'text-brass-2 bg-bg-3' : 'text-ink-3 hover:text-ink'}`}>
                  <Icon size={16} />
                </NavLink>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setPalette(true)}
            className={`flex items-center gap-2 h-8 px-3 rounded-[4px] border border-line-2 bg-bg text-ink-3 hover:text-ink hover:border-ink-4 transition-colors ${overlay ? 'w-52' : 'w-80'}`}
          >
            <Search size={15} />
            <span className="flex-1 text-left text-[13px] truncate">{overlay ? 'Поиск…' : 'Найти предмет, квест, карту…'}</span>
            {!overlay && <Kbd>Ctrl K</Kbd>}
          </button>
          <div className="flex-1" />
          <ModeSwitch />
          <UpdateButton />
          <ScavTimer />
          <Freshness />
          <ThemeButton />
          <PhoneButton />
          <MapWindowButton />
          <MiniMapButton />
          <OnTopButton />
          <button
            type="button"
            onClick={() => setOverlay(!overlay)}
            title={overlay ? 'Полный режим' : 'Компактный режим (оверлей)'}
            className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-[4px] border transition-colors text-[12px] font-display uppercase tracking-[.1em]
              ${overlay ? 'border-brass-3 text-brass-2 bg-brass/10' : 'border-line-2 text-ink-3 hover:text-ink hover:border-ink-4'}`}
          >
            <PictureInPicture2 size={15} />
            {!overlay && 'Оверлей'}
          </button>
        </header>

        <main className={`flex-1 min-h-0 relative isolate ${isMap ? '' : 'overflow-y-auto'}`}>
          <Outlet />
        </main>
      </div>

      <ItemDrawer />
      <SearchPalette />
      <Lightbox />
    </div>
  )
}

/** PvP / PvE текущего персонажа. Смена режима перезагружает справочник — у PvE своя барахолка. */
function ModeSwitch() {
  const mode = useProfile((s) => s.gameMode)
  const setMode = useProfile((s) => s.setGameMode)
  const load = useData((s) => s.load)
  const overlay = useUI((s) => s.overlay)
  const pick = (m: GameMode) => { if (m !== mode) { setMode(m); void load(m) } }
  return (
    <div className="inline-flex h-8 rounded-[4px] border border-line-2 bg-bg p-[2px] gap-[2px]" title="Режим персонажа: у PvE и сезона своя барахолка">
      {(['regular', 'pvp-season', 'pve'] as const).map((m) => (
        <button key={m} type="button" onClick={() => pick(m)}
          className={`display text-[12px] tracking-[.1em] rounded-[3px] transition-colors ${overlay ? 'px-2' : 'px-3'} ${mode === m ? (m === 'pve' ? 'bg-info/15 text-info' : 'bg-bg-3 text-brass-2') : 'text-ink-3 hover:text-ink'}`}>
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  )
}

/** Таймер кулдауна дикого: нажал после смерти на скаве — видишь, когда снова можно. */
function ScavTimer() {
  const data = useData((s) => s.data)
  const readyAt = useUI((s) => s.scavReadyAt)
  const setReadyAt = useUI((s) => s.setScavReadyAt)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!readyAt) return
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [readyAt])
  const cooldown = data?.scavCooldownSeconds ?? 1500
  const left = readyAt ? Math.max(0, readyAt - Date.now()) : 0
  const active = !!readyAt && left > 0
  const mm = Math.floor(left / 60000)
  const ss = Math.floor((left % 60000) / 1000)
  return (
    <button
      type="button"
      onClick={() => setReadyAt(active ? null : Date.now() + cooldown * 1000)}
      title={active ? 'Сбросить таймер дикого' : `Запустить кулдаун дикого (${Math.round(cooldown / 60)} мин)`}
      className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-[4px] border text-[12px] font-display uppercase tracking-[.1em] transition-colors
        ${active ? 'border-scav/60 text-scav bg-scav/10' : readyAt ? 'border-fir/60 text-fir bg-fir/10' : 'border-line-2 text-ink-3 hover:text-ink hover:border-ink-4'}`}
    >
      <Timer size={14} />
      {active ? <span className="num">{mm}:{String(ss).padStart(2, '0')}</span> : readyAt ? 'Дикий готов' : 'Дикий'}
    </button>
  )
}

/** Есть новая версия — кнопка ведёт в профиль, где кнопка «Установить». */
function UpdateButton() {
  const info = useUI((s) => s.updateInfo)
  const overlay = useUI((s) => s.overlay)
  if (!info?.update) return null
  const st = info.state.stage
  const busy = st === 'downloading' || st === 'extracting' || st === 'restarting'
  const pct = st === 'downloading' && info.state.total ? Math.round(((info.state.done ?? 0) / info.state.total) * 100) : null
  return (
    <NavLink to="/profile" title={`Доступна Sherpa ${info.update.version} (сейчас ${info.version}). Открыть профиль — там «Что нового» и установка.`}
      className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-[4px] border border-brass-3 text-brass-2 bg-brass/10 hover:bg-brass/20 transition-colors text-[12px] font-display uppercase tracking-[.1em] whitespace-nowrap">
      <Download size={14} className={busy ? 'animate-bounce' : ''} />
      {!overlay && (busy ? (st === 'downloading' ? `Качаю${pct != null ? ` ${pct}%` : '…'}` : st === 'restarting' ? 'Перезапуск…' : 'Распаковка…') : `Обновление ${info.update.version}`)}
    </NavLink>
  )
}

/** Тёмная / светлая тема. */
function ThemeButton() {
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const light = theme === 'light'
  return (
    <button
      type="button"
      onClick={() => setTheme(light ? 'dark' : 'light')}
      title={light ? 'Тёмная тема' : 'Светлая тема'}
      className="h-8 w-8 grid place-items-center rounded-[4px] border border-line-2 text-ink-3 hover:text-ink hover:border-ink-4 transition-colors"
    >
      {light ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  )
}

/** Мини-карта отдельным окном — только внутри лаунчера. */
function MiniMapButton() {
  const api = useLauncher()
  if (!api?.toggle_minimap) return null
  return (
    <button
      type="button"
      onClick={() => api.toggle_minimap?.().catch(() => {})}
      title="Мини-карта поверх игры (F8)"
      className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-[4px] border border-line-2 text-ink-3 hover:text-ink hover:border-ink-4 transition-colors text-[12px] font-display uppercase tracking-[.1em]"
    >
      <Radar size={14} />
      Мини
    </button>
  )
}

/** «Карта на телефоне»: QR-код и ссылка, по которой телефон едет за тобой — только внутри лаунчера. */
function PhoneButton() {
  const api = useLauncher()
  const [open, setOpen] = useState(false)
  if (!api?.enable_lan) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Карта на телефоне: QR-код, телефон едет за тобой"
        className="h-8 w-8 grid place-items-center rounded-[4px] border border-line-2 text-ink-3 hover:text-ink hover:border-ink-4 transition-colors"
      >
        <Smartphone size={14} />
      </button>
      {open && <PhoneDialog onClose={() => setOpen(false)} />}
    </>
  )
}

/** Отдельное окно карты поверх игры (F7) — только внутри лаунчера. */
function MapWindowButton() {
  const api = useLauncher()
  if (!api?.toggle_mapwin) return null
  return (
    <button
      type="button"
      onClick={() => api.toggle_mapwin?.().catch(() => {})}
      title="Карта отдельным окном поверх игры (F7 — показать/скрыть)"
      className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-[4px] border border-line-2 text-ink-3 hover:text-ink hover:border-ink-4 transition-colors text-[12px] font-display uppercase tracking-[.1em]"
    >
      <MapIcon size={14} />
      Карта
    </button>
  )
}

/** Кнопка «поверх всех окон» — только внутри лаунчера. */
function OnTopButton() {
  const api = useLauncher()
  const [onTop, setOnTop] = useOnTop(api)
  if (!api) return null
  return (
    <button
      type="button"
      onClick={() => setOnTop(!onTop)}
      title={onTop ? 'Окно поверх игры (F9 — выключить)' : 'Обычное окно (F9 — поверх игры)'}
      className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-[4px] border transition-colors text-[12px] font-display uppercase tracking-[.1em]
        ${onTop ? 'border-brass-3 text-brass-2 bg-brass/10' : 'border-line-2 text-ink-3 hover:text-ink hover:border-ink-4'}`}
    >
      <Pin size={14} />
      Поверх
    </button>
  )
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`display text-brass leading-none select-none ${small ? 'text-[15px]' : 'text-[18px]'}`} title="Sherpa">
      <span className="tracking-[.1em]">SHER</span><span className="text-ink-2 tracking-[.1em]">PA</span>
    </div>
  )
}

function LevelBadge() {
  const level = useProfile((s) => s.level)
  const faction = useProfile((s) => s.faction)
  const name = useProfile((s) => s.name)
  const seasonal = useProfile((s) => s.seasonal)
  const mode = useProfile((s) => s.gameMode)
  return (
    <NavLink to="/profile" title={name} className="border-t border-line py-3 flex flex-col items-center gap-0.5 hover:bg-bg-2 transition-colors">
      <span className="num text-[20px] font-semibold text-ink leading-none">{level}</span>
      <span className="eyebrow">{faction}</span>
      <span className={`text-[10px] truncate max-w-[72px] ${seasonal ? 'text-brass' : 'text-ink-3'}`}>{seasonal ? 'сезон' : name}</span>
      {mode === 'pve' && <span className="text-[9px] tracking-[.12em] text-info">PvE</span>}
    </NavLink>
  )
}

function Freshness() {
  const data = useData((s) => s.data)
  const refreshing = useData((s) => s.refreshing)
  const refresh = useData((s) => s.refresh)
  const error = useData((s) => s.error)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!data) return null
  const stale = data.priceAggregateStale
  return (
    <button
      type="button"
      onClick={() => refresh()}
      disabled={refreshing}
      title={error ? `Ошибка обновления: ${error}` : stale ? `Сводные цены tarkov.dev для этого режима от ${new Date(data.priceScanAt).toLocaleDateString('ru-RU')} — Sherpa подтягивает свежие по истории для того, что открыто` : 'Обновить цены'}
      className="h-8 px-2.5 inline-flex items-center gap-2 rounded-[4px] text-[12px] text-ink-3 hover:text-ink transition-colors disabled:opacity-70 shrink-0"
    >
      <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
      <span className="hidden lg:inline whitespace-nowrap">
        {refreshing ? 'обновляю…' : error ? <span className="text-danger">цены не обновились</span> : stale ? <span className="text-scav">сводка от {new Date(data.priceScanAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span> : `цены ${ago(data.fetchedAt)}`}
      </span>
    </button>
  )
}
