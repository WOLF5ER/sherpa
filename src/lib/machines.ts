import type { GameInfo } from './pywebview'

/**
 * Явные машины состояний Sherpa. Все процессы с фазами (обновление, туннель, стадия игры,
 * сквад-подключение) описаны здесь: множества состояний, легальные переходы и подписи для UI.
 * Подробные диаграммы и ловушки — MACHINES.md в корне репозитория.
 *
 * Правило: компоненты не сравнивают строки стадий напрямую — только через предикаты отсюда
 * (`updateBusy`, `tunnelOn`, `gameInRaid`, …). Новые стадии добавляются здесь, TypeScript
 * подсветит неперебранные switch/тернарники.
 */

/* ── Обновление приложения (лаунчер, UpdateInfo.state.stage; источник переходов — sherpa.py) ──
 *
 * idle →(check_update) checking →(ok|нет релиза) idle
 *                            ↘(ошибка сети) error
 * idle →(install_update) downloading → extracting → restarting → (перезапуск)
 *                        ↘(сеть/архив) error        ↘ error
 * error →(check_update|install_update) checking|downloading
 */
export const UPDATE_STAGES = ['idle', 'checking', 'downloading', 'extracting', 'restarting', 'error'] as const
export type UpdateStage = (typeof UPDATE_STAGES)[number]

/** Идёт активная установка — кнопки запуска новой установки блокируются. */
export function updateBusy(stage: UpdateStage): boolean {
  return stage === 'downloading' || stage === 'extracting' || stage === 'restarting'
}

/** Короткая подпись для кнопки в шапке; null — нечего показывать. */
export function updateBusyLabel(stage: UpdateStage, pct: number | null): string | null {
  if (!updateBusy(stage)) return null
  if (stage === 'downloading') return `Качаю${pct != null ? ` ${pct}%` : '…'}`
  return stage === 'restarting' ? 'Перезапуск…' : 'Распаковка…'
}

/* ── Туннель Cloudflare (лаунчер, LauncherState.tunnel_state; переходы — sherpa.py start_tunnel) ──
 *
 * off →(enable_tunnel) downloading →(скачан cloudflared) starting →(адрес получен) up
 *                    ↘(exe уже есть) starting                          ↘(процесс умер) off|missing
 * up|starting|downloading →(disable) off
 * missing — cloudflared не нашли и не скачали; off — выключен.
 */
export const TUNNEL_STATES = ['off', 'downloading', 'starting', 'up', 'missing'] as const
export type TunnelState = (typeof TUNNEL_STATES)[number]

/** Лаунчер присылает состояние строкой — сужаем к известным; незнакомое считаем «выключено». */
export function asTunnelState(state: string | null | undefined): TunnelState {
  return (TUNNEL_STATES as readonly string[]).includes(state ?? '') ? (state as TunnelState) : 'off'
}

/** Туннель «включён» с точки зрения переключателя: уже работает или поднимается. */
export function tunnelOn(state: string | null | undefined): boolean {
  const s = asTunnelState(state)
  return s === 'up' || s === 'starting' || s === 'downloading'
}

/** Подпись-статус под переключателем туннеля; url показывается отдельно, когда state === 'up'. */
export function tunnelStatusLabel(state: string | null | undefined, url: string | null | undefined): string {
  const s = asTunnelState(state)
  if (s === 'up' && url) return url
  if (s === 'starting') return 'поднимаю туннель… (5–15 с)'
  if (s === 'downloading') return 'скачиваю cloudflared (~55 МБ, один раз)…'
  if (s === 'missing') return 'не удалось запустить туннель — проверь интернет или положи cloudflared.exe рядом с Sherpa.exe'
  return 'публичный адрес появится здесь'
}

/* ── Стадия игры из логов (GameInfo.stage; переходы — вотчер логов в sherpa.py) ──
 *
 * menu →(выбрана локация) loading →(загрузка карты кончилась) raid →(выход) menu
 * loading → (бросил загрузку) menu
 */
export const GAME_STAGES = ['menu', 'loading', 'raid'] as const
export type GameStage = (typeof GAME_STAGES)[number]

export const GAME_STAGE_RU: Record<GameStage, string> = { raid: 'в рейде', loading: 'загрузка', menu: 'в меню' }

/** Игрок ушёл из меню — в загрузке или в рейде (пора показывать карту рейда). */
export function gameInRaid(g: GameInfo | null | undefined): boolean {
  return !!g && g.stage !== 'menu'
}

/* ── Подключение к комнате сквада (lib/squad.ts subscribeSquad) ──
 *
 * connecting →(SSE открыт) streaming ⇄ offline →(retry c backoff) connecting …
 * connecting →(5 с без данных — туннель CF буферизует SSE) polling ⇄ offline
 * off — подписки нет (вышли из комнаты); в store хранится как squadPhase.
 */
export const SQUAD_PHASES = ['off', 'connecting', 'streaming', 'polling', 'offline'] as const
export type SquadPhase = (typeof SQUAD_PHASES)[number]
/** Фаза активной подписки (без «off») — то, что callback subscribeSquad отдаёт наружу. */
export type SquadLinkPhase = Exclude<SquadPhase, 'off'>

export const SQUAD_PHASE_RU: Record<SquadPhase, string> = {
  off: 'не в комнате',
  connecting: 'подключаюсь…',
  streaming: 'на связи',
  polling: 'опрос (SSE недоступен)',
  offline: 'нет связи',
}

/** Есть живой обмен с хостом (SSE или опрос) — «на связи». */
export function squadLinked(phase: SquadPhase): boolean {
  return phase === 'streaming' || phase === 'polling'
}

/* ── Текущий рейд (store/raids.ts) — см. raidPhase там; логика резки не здесь ── */
