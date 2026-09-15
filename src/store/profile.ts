import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameMode } from '@/data/loader'

export type Faction = 'USEC' | 'BEAR'

/** Всё, что относится к одному персонажу (основной, сезонный…). */
export interface ProfileData {
  name: string
  level: number
  faction: Faction
  /** PvP или PvE — у каждого персонажа свой; PvE-контент в PvP не показывается и наоборот */
  gameMode: GameMode
  /** сезонный персонаж */
  seasonal: boolean
  /** сезонный модификатор «неработающая барахолка» */
  fleaDisabled: boolean
  /** выполненные квесты */
  completed: Record<string, true>
  /** выполненные пункты заданий (id objective): «камера заложена» — отметка исчезает с карты */
  objectivesDone: Record<string, true>
  /** уровни станций схрона: id → level */
  stations: Record<string, number>
  /** сколько уже собрано: itemId → count */
  have: Record<string, number>
  /** ручной уровень торговца (если не задан — считается по уровню игрока) */
  traderLevels: Record<string, number>
  /** репутация у Скупщика (карма дикого) — влияет на кулдаун дикого */
  fenceRep: number
  /** полученные достижения (отмечаются вручную) */
  achievements: Record<string, true>
  /** уровни навыков (вручную): id навыка tarkov.dev (Endurance, StressResistance…) → уровень 0–51 */
  skills: Record<string, number>
  /** токен TarkovTracker для импорта прогресса (хранится только локально) */
  ttToken: string
  ttSyncedAt: number | null
}

export interface ProfileState extends ProfileData {
  kappaOnly: boolean
  showLockedTasks: boolean
  /** id активного персонажа; его данные лежат «плоско» в этом же состоянии */
  active: string
  /** остальные персонажи (снимки) */
  profiles: Record<string, ProfileData>

  setLevel: (n: number) => void
  setFaction: (f: Faction) => void
  setGameMode: (m: GameMode) => void
  setSeasonal: (v: boolean) => void
  setFleaDisabled: (v: boolean) => void
  toggleTask: (id: string, done?: boolean) => void
  toggleObjective: (id: string, done?: boolean) => void
  completeMany: (ids: string[]) => void
  uncompleteMany: (ids: string[]) => void
  setStation: (id: string, level: number) => void
  setHave: (item: string, n: number) => void
  setTraderLevel: (trader: string, level: number | null) => void
  setFenceRep: (rep: number) => void
  toggleAchievement: (id: string) => void
  setSkill: (id: string, level: number) => void
  setKappaOnly: (v: boolean) => void
  setShowLockedTasks: (v: boolean) => void
  setTtToken: (t: string) => void
  applyImport: (patch: Partial<ProfileData>) => void
  switchProfile: (id: string) => void
  addProfile: (name: string, seasonal: boolean, gameMode?: GameMode) => void
  renameProfile: (name: string) => void
  deleteProfile: (id: string) => void
  reset: () => void
}

export const blankProfile = (name: string, seasonal = false, gameMode: GameMode = 'regular'): ProfileData => ({
  name, level: 1, faction: 'USEC', gameMode, seasonal, fleaDisabled: false,
  completed: {}, objectivesDone: {}, stations: {}, have: {}, traderLevels: {}, fenceRep: 0, achievements: {}, skills: {}, ttToken: '', ttSyncedAt: null,
})

const PROFILE_KEYS: (keyof ProfileData)[] = [
  'name', 'level', 'faction', 'gameMode', 'seasonal', 'fleaDisabled', 'completed', 'objectivesDone', 'stations', 'have', 'traderLevels', 'fenceRep', 'achievements',
  'skills', 'ttToken', 'ttSyncedAt',
]

function snapshot(s: ProfileData): ProfileData {
  const out: Record<string, unknown> = {}
  for (const k of PROFILE_KEYS) out[k] = s[k]
  return out as unknown as ProfileData
}

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      ...blankProfile('Основной'),
      kappaOnly: false,
      showLockedTasks: true,
      active: 'main',
      profiles: {},

      setLevel: (n) => set({ level: Math.max(1, Math.min(79, Math.round(n) || 1)) }),
      setFaction: (faction) => set({ faction }),
      // сезонный персонаж и режим pvp-season — одно и то же с двух сторон
      setGameMode: (gameMode) => set({ gameMode, seasonal: gameMode === 'pvp-season' }),
      setSeasonal: (seasonal) => set((s) => ({ seasonal, gameMode: seasonal ? 'pvp-season' : s.gameMode === 'pvp-season' ? 'regular' : s.gameMode })),
      setFleaDisabled: (fleaDisabled) => set({ fleaDisabled }),
      toggleTask: (id, done) => set((s) => {
        const next = { ...s.completed }
        const target = done ?? !next[id]
        if (target) next[id] = true
        else delete next[id]
        return { completed: next }
      }),
      toggleObjective: (id, done) => set((s) => {
        const next = { ...s.objectivesDone }
        const target = done ?? !next[id]
        if (target) next[id] = true
        else delete next[id]
        return { objectivesDone: next }
      }),
      completeMany: (ids) => set((s) => {
        const next = { ...s.completed }
        for (const id of ids) next[id] = true
        return { completed: next }
      }),
      uncompleteMany: (ids) => set((s) => {
        const next = { ...s.completed }
        for (const id of ids) delete next[id]
        return { completed: next }
      }),
      setStation: (id, level) => set((s) => ({ stations: { ...s.stations, [id]: Math.max(0, level) } })),
      setHave: (item, n) => set((s) => {
        const have = { ...s.have }
        if (n <= 0) delete have[item]
        else have[item] = n
        return { have }
      }),
      setTraderLevel: (trader, level) => set((s) => {
        const traderLevels = { ...s.traderLevels }
        if (level == null) delete traderLevels[trader]
        else traderLevels[trader] = level
        return { traderLevels }
      }),
      setFenceRep: (rep) => set({ fenceRep: Number.isFinite(rep) ? Math.round(Math.max(-10, Math.min(10, rep)) * 100) / 100 : 0 }),
      toggleAchievement: (id) => set((s) => {
        const achievements = { ...s.achievements }
        if (achievements[id]) delete achievements[id]
        else achievements[id] = true
        return { achievements }
      }),
      setSkill: (id, level) => set((s) => {
        const skills = { ...s.skills }
        const v = Math.max(0, Math.min(51, Math.round(level) || 0))
        if (v <= 0) delete skills[id]
        else skills[id] = v
        return { skills }
      }),
      setKappaOnly: (kappaOnly) => set({ kappaOnly }),
      setShowLockedTasks: (showLockedTasks) => set({ showLockedTasks }),
      setTtToken: (ttToken) => set({ ttToken: ttToken.trim() }),
      applyImport: (patch) => set({ ...patch }),

      switchProfile: (id) => {
        const s = get()
        if (id === s.active) return
        const target = s.profiles[id]
        if (!target) return
        const profiles = { ...s.profiles, [s.active]: snapshot(s) }
        delete profiles[id]
        set({ ...target, active: id, profiles })
      },
      addProfile: (name, seasonal, gameMode = 'regular') => {
        const s = get()
        const id = `p${Date.now().toString(36)}`
        const profiles = { ...s.profiles, [s.active]: snapshot(s) }
        const mode: GameMode = seasonal ? 'pvp-season' : gameMode
        set({ ...blankProfile(name.trim() || (seasonal ? 'Сезонный' : gameMode === 'pve' ? 'PvE' : 'Персонаж'), seasonal, mode), active: id, profiles })
      },
      renameProfile: (name) => set({ name: name.trim() || 'Персонаж' }),
      deleteProfile: (id) => {
        const s = get()
        if (id === s.active) {
          const rest = Object.keys(s.profiles)
          if (!rest.length) { set({ ...blankProfile(s.seasonal ? 'Сезонный' : 'Основной', s.seasonal, s.gameMode) }); return }
          const nextId = rest[0]
          const profiles = { ...s.profiles }
          const target = profiles[nextId]
          delete profiles[nextId]
          set({ ...target, active: nextId, profiles })
          return
        }
        const profiles = { ...s.profiles }
        delete profiles[id]
        set({ profiles })
      },
      reset: () => set({ ...blankProfile(get().name, get().seasonal, get().gameMode) }),
    }),
    {
      name: 'sherpa:profile',
      version: 8,
      migrate: (persisted, version) => {
        let p = (persisted ?? {}) as Partial<ProfileState>
        if (version < 2) {
          p = { ...blankProfile('Основной'), ...p, active: 'main', profiles: {}, achievements: {}, seasonal: false, fleaDisabled: false }
        }
        if (version < 3) {
          p = { ...p, ttToken: '', ttSyncedAt: null }
          const profiles = { ...(p.profiles ?? {}) }
          for (const id of Object.keys(profiles)) profiles[id] = { ...profiles[id], ttToken: '', ttSyncedAt: null }
          p.profiles = profiles
        }
        if (version < 4) {
          // режим игры был общим — раздаём его всем персонажам
          const mode = (p.gameMode ?? 'regular') as GameMode
          p = { ...p, gameMode: mode }
          const profiles = { ...(p.profiles ?? {}) }
          for (const id of Object.keys(profiles)) profiles[id] = { ...profiles[id], gameMode: profiles[id].gameMode ?? mode }
          p.profiles = profiles
        }
        if (version < 5) {
          // сезонные персонажи переезжают на ленту pvp-season
          if (p.seasonal) p.gameMode = 'pvp-season'
          const profiles = { ...(p.profiles ?? {}) }
          for (const id of Object.keys(profiles)) if (profiles[id].seasonal) profiles[id] = { ...profiles[id], gameMode: 'pvp-season' }
          p.profiles = profiles
        }
        if (version < 6) {
          p = { ...p, objectivesDone: p.objectivesDone ?? {} }
          const profiles = { ...(p.profiles ?? {}) }
          for (const id of Object.keys(profiles)) profiles[id] = { ...profiles[id], objectivesDone: profiles[id].objectivesDone ?? {} }
          p.profiles = profiles
        }
        if (version < 7) {
          p = { ...p, skills: p.skills ?? {} }
          const profiles = { ...(p.profiles ?? {}) }
          for (const id of Object.keys(profiles)) profiles[id] = { ...profiles[id], skills: profiles[id].skills ?? {} }
          p.profiles = profiles
        }
        if (version < 8) {
          p = { ...p, fenceRep: p.fenceRep ?? 0 }
          const profiles = { ...(p.profiles ?? {}) }
          for (const id of Object.keys(profiles)) profiles[id] = { ...profiles[id], fenceRep: profiles[id].fenceRep ?? 0 }
          p.profiles = profiles
        }
        return p as ProfileState
      },
    },
  ),
)

/** Список всех персонажей для переключателя: активный + снимки. */
export function useProfileList(): { id: string; name: string; seasonal: boolean; gameMode: GameMode; level: number; active: boolean }[] {
  const active = useProfile((s) => s.active)
  const name = useProfile((s) => s.name)
  const seasonal = useProfile((s) => s.seasonal)
  const gameMode = useProfile((s) => s.gameMode)
  const level = useProfile((s) => s.level)
  const profiles = useProfile((s) => s.profiles)
  return [
    { id: active, name, seasonal, gameMode, level, active: true },
    ...Object.entries(profiles).map(([id, p]) => ({ id, name: p.name, seasonal: p.seasonal, gameMode: p.gameMode ?? 'regular', level: p.level, active: false })),
  ].sort((a, b) => a.id.localeCompare(b.id)) // порядок не прыгает при переключении
}
