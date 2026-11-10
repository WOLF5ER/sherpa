import { create } from 'zustand'

export type ToastKind = 'ok' | 'info' | 'err'
export interface Toast { id: number; text: string; kind: ToastKind }

interface ToastState {
  toasts: Toast[]
  push: (text: string, kind?: ToastKind) => void
  drop: (id: number) => void
}

let seq = 1

/** Короткие подтверждения действий в правом нижнем углу. Живут 2.6 с, максимум 4 на экране. */
export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (text, kind = 'ok') => {
    const id = seq++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600)
  },
  drop: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function toast(text: string, kind: ToastKind = 'ok') {
  useToast.getState().push(text, kind)
}
