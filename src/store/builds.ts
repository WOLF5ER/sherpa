import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SavedBuild { id: string; name: string; weapon: string; data: string; ts: number }

interface BuildsState {
  builds: SavedBuild[]
  save: (name: string, weapon: string, data: string) => void
  remove: (id: string) => void
}

/** Сохранённые сборки — общие для всех персонажей. */
export const useBuilds = create<BuildsState>()(
  persist(
    (set) => ({
      builds: [],
      save: (name, weapon, data) => set((s) => ({ builds: [{ id: `b${Date.now().toString(36)}`, name, weapon, data, ts: Date.now() }, ...s.builds].slice(0, 100) })),
      remove: (id) => set((s) => ({ builds: s.builds.filter((b) => b.id !== id) })),
    }),
    { name: 'sherpa:builds' },
  ),
)
