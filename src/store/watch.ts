import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface WatchEntry {
  /** порог: сигналить, когда цена рынка опустится ниже (покупка) или поднимется выше (продажа) */
  below: number | null
  above: number | null
  addedAt: number
}

interface WatchState {
  items: Record<string, WatchEntry>
  toggle: (id: string) => void
  setBelow: (id: string, v: number | null) => void
  setAbove: (id: string, v: number | null) => void
}

/** Список слежения барахолки — общий для всех персонажей. */
export const useWatch = create<WatchState>()(
  persist(
    (set) => ({
      items: {},
      toggle: (id) => set((s) => {
        const items = { ...s.items }
        if (items[id]) delete items[id]
        else items[id] = { below: null, above: null, addedAt: Date.now() }
        return { items }
      }),
      setBelow: (id, below) => set((s) => ({ items: { ...s.items, [id]: { ...s.items[id], below } } })),
      setAbove: (id, above) => set((s) => ({ items: { ...s.items, [id]: { ...s.items[id], above } } })),
    }),
    { name: 'sherpa:watch' },
  ),
)
