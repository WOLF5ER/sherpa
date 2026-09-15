import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlayerPos, UpdateInfo } from '@/lib/pywebview'
import type { SquadMember, SquadMark } from '@/lib/squad'
import { useRaids } from './raids'

interface UIState {
  /** открытая карточка предмета */
  itemId: string | null
  openItem: (id: string) => void
  closeItem: () => void
  /** глобальный поиск */
  paletteOpen: boolean
  setPalette: (v: boolean) => void
  /** компактный режим (оверлей) */
  overlay: boolean
  setOverlay: (v: boolean) => void
  opacity: number
  setOpacity: (v: number) => void
  /** таймер кулдауна дикого: когда снова доступен (ms) */
  scavReadyAt: number | null
  setScavReadyAt: (v: number | null) => void
  /** «ты здесь» по скриншотам — предпочтение и последняя позиция */
  screenshotsWatch: boolean
  setScreenshotsWatch: (v: boolean) => void
  playerPos: PlayerPos | null
  setPlayerPos: (p: PlayerPos | null) => void
  /** след пути за рейд (сессия) */
  trail: PlayerPos[]
  clearTrail: () => void
  followPlayer: boolean
  setFollowPlayer: (v: boolean) => void
  autoFloor: boolean
  setAutoFloor: (v: boolean) => void
  /** подложка карты: схема (SVG) или 3D-рендер (тайлы) — там, где есть обе */
  mapStyle: MapStyle
  setMapStyle: (v: MapStyle) => void
  /** источник позиции без лаунчера: папка в браузере */
  folderStatus: 'unsupported' | 'none' | 'prompt' | 'granted'
  setFolderStatus: (s: 'unsupported' | 'none' | 'prompt' | 'granted') => void
  /** свои метки на карте: mapId → метки */
  marks: Record<string, MapMark[]>
  addMark: (mapId: string, m: MapMark) => void
  removeMark: (mapId: string, id: string) => void
  /** сквад: настройки (persist) и живое состояние */
  squad: SquadSettings
  setSquad: (patch: Partial<SquadSettings>) => void
  squadMembers: Record<string, SquadMember>
  setSquadMembers: (m: Record<string, SquadMember>) => void
  squadConnected: boolean
  setSquadConnected: (v: boolean) => void
  /** общая карта комнаты (normalizedName) и общие метки */
  squadMap: string
  setSquadMap: (m: string) => void
  squadMarks: Record<string, SquadMark>
  setSquadMarks: (m: Record<string, SquadMark>) => void
  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void
  /** отслеживаемые квесты: их метки подсвечены на карте, остальные приглушены */
  trackedTasks: string[]
  toggleTracked: (id: string) => void
  clearTracked: () => void
  /** карта, выбранная на странице карт (для сквада) */
  currentMapId: string | null
  setCurrentMapId: (id: string | null) => void
  /** обновление Sherpa (от лаунчера; в браузере — null) */
  updateInfo: UpdateInfo | null
  setUpdateInfo: (u: UpdateInfo | null) => void
}

export type MapStyle = 'scheme' | 'render'
export interface SquadSettings { url: string; room: string; name: string; share: boolean; followMap: boolean }

export interface MapMark { id: string; x: number; z: number; y?: number; name: string; ts: number }

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      itemId: null,
      openItem: (itemId) => set({ itemId }),
      closeItem: () => set({ itemId: null }),
      paletteOpen: false,
      setPalette: (paletteOpen) => set({ paletteOpen }),
      overlay: false,
      setOverlay: (overlay) => set({ overlay }),
      opacity: 1,
      setOpacity: (opacity) => set({ opacity: Math.max(0.3, Math.min(1, opacity)) }),
      scavReadyAt: null,
      setScavReadyAt: (scavReadyAt) => set({ scavReadyAt }),
      screenshotsWatch: true, // в лаунчере просто читаем имена файлов из папки — включено сразу; в браузере всё равно нужно выбрать папку
      setScreenshotsWatch: (screenshotsWatch) => set({ screenshotsWatch }),
      playerPos: null,
      setPlayerPos: (playerPos) => set((s) => ({
        playerPos,
        // след: только новые точки, не дальше 200
        trail: playerPos ? [...s.trail.filter((p) => p.ts !== playerPos.ts), playerPos].slice(-200) : s.trail,
      })),
      trail: [],
      // сброс следа заодно закрывает текущий рейд в истории — следующий скриншот начнёт новый
      clearTrail: () => { useRaids.getState().endCurrent(); set({ trail: [], playerPos: null }) },
      followPlayer: true,
      setFollowPlayer: (followPlayer) => set({ followPlayer }),
      autoFloor: true,
      setAutoFloor: (autoFloor) => set({ autoFloor }),
      mapStyle: 'scheme',
      setMapStyle: (mapStyle) => set({ mapStyle }),
      folderStatus: 'none',
      setFolderStatus: (folderStatus) => set({ folderStatus }),
      marks: {},
      addMark: (mapId, m) => set((s) => ({ marks: { ...s.marks, [mapId]: [...(s.marks[mapId] ?? []), m] } })),
      removeMark: (mapId, id) => set((s) => ({ marks: { ...s.marks, [mapId]: (s.marks[mapId] ?? []).filter((m) => m.id !== id) } })),
      squad: { url: '', room: '', name: '', share: true, followMap: true },
      setSquad: (patch) => set((s) => ({ squad: { ...s.squad, ...patch } })),
      squadMembers: {},
      setSquadMembers: (squadMembers) => set({ squadMembers }),
      squadConnected: false,
      setSquadConnected: (squadConnected) => set({ squadConnected }),
      squadMap: '',
      setSquadMap: (squadMap) => set({ squadMap }),
      squadMarks: {},
      setSquadMarks: (squadMarks) => set({ squadMarks }),
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      trackedTasks: [],
      toggleTracked: (id) => set((s) => ({ trackedTasks: s.trackedTasks.includes(id) ? s.trackedTasks.filter((x) => x !== id) : [...s.trackedTasks, id] })),
      clearTracked: () => set({ trackedTasks: [] }),
      currentMapId: null,
      setCurrentMapId: (currentMapId) => set({ currentMapId }),
      updateInfo: null,
      setUpdateInfo: (updateInfo) => set({ updateInfo }),
    }),
    {
      name: 'sherpa:ui',
      version: 1,
      // v1: слежение за скриншотами включено по умолчанию (раньше было выключено, и точка «молчала»)
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>
        return (version < 1 ? { ...p, screenshotsWatch: true } : p) as never
      },
      // настройки сквада дополняем новыми полями, а не заменяем целиком
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UIState>
        return { ...current, ...p, squad: { ...current.squad, ...(p.squad ?? {}) } }
      },
      partialize: (s) => ({ overlay: s.overlay, opacity: s.opacity, scavReadyAt: s.scavReadyAt, screenshotsWatch: s.screenshotsWatch, followPlayer: s.followPlayer, autoFloor: s.autoFloor, mapStyle: s.mapStyle, marks: s.marks, squad: s.squad, theme: s.theme, currentMapId: s.currentMapId, trackedTasks: s.trackedTasks }) },
  ),
)
