/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Поправки к данным tarkov.dev из проекта tarkov-data-overlay (TarkovTracker):
 * фракция квеста, уровень лояльности торговца, убранные из игры квесты, недостающие цепочки, координаты зон.
 * https://github.com/tarkovtracker-org/tarkov-data-overlay — каждая правка там подтверждена ссылкой на вики.
 * Применяется к сырым задачам до normalize; при недоступности CDN работаем без поправок.
 */
import type { GameMode } from './loader'

const URLS = [
  'https://cdn.jsdelivr.net/gh/tarkovtracker-org/tarkov-data-overlay@main/dist/overlay.json',
  'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay.json',
]

export interface Overlay {
  tasks?: Record<string, any>
  modes?: Record<string, { tasks?: Record<string, any> }>
  $meta?: { version?: string; generated?: string }
}

export async function fetchOverlay(signal?: AbortSignal): Promise<Overlay | null> {
  for (const url of URLS) {
    try {
      const res = await fetch(url, { signal, cache: 'no-cache' })
      if (!res.ok) continue
      const o = (await res.json()) as Overlay
      if (o && typeof o === 'object' && o.tasks) return o
    } catch (e) {
      if (signal?.aborted) throw e
    }
  }
  console.warn('[overlay] не загрузился — работаем на чистых данных tarkov.dev')
  return null
}

const idOf = (x: any): string => (x && typeof x === 'object' ? x.id : x)

/** Применить поправки к словарю сырых задач tarkov.dev. Возвращает число тронутых задач. */
export function applyOverlay(tasks: Record<string, any>, overlay: Overlay | null, mode: GameMode): number {
  if (!overlay?.tasks) return 0
  let n = 0
  for (const [id, raw] of Object.entries(tasks)) {
    const shared = overlay.tasks[id]
    const modeOv = overlay.modes?.[mode]?.tasks?.[id]
    if (!shared && !modeOv) continue
    const ov = { ...(shared ?? {}), ...(modeOv ?? {}) }
    if (shared?.objectives && modeOv?.objectives) ov.objectives = { ...shared.objectives, ...modeOv.objectives }
    const patched: string[] = raw.__patched ?? []
    if (ov.disabled === true) { delete tasks[id]; n++; continue }
    if (ov.factionName && ov.factionName !== raw.factionName) { raw.factionName = ov.factionName; patched.push('factionName') }
    if (typeof ov.minPlayerLevel === 'number' && ov.minPlayerLevel !== raw.minPlayerLevel) { raw.minPlayerLevel = ov.minPlayerLevel; patched.push('minPlayerLevel') }
    if (typeof ov.experience === 'number') raw.experience = ov.experience
    if (typeof ov.wikiLink === 'string') raw.wikiLink = ov.wikiLink
    if (Array.isArray(ov.traderRequirements)) {
      // patch-by-id: пустой массив — очистить, иначе дополнить/поправить по id (см. docs/INTEGRATION.md overlay)
      if (ov.traderRequirements.length === 0) raw.traderRequirements = []
      else {
        const byId = new Map<string, any>((raw.traderRequirements ?? []).map((r: any, i: number) => [r.id ?? `#${i}`, r]))
        for (const r of ov.traderRequirements) byId.set(r.id, { ...(byId.get(r.id) ?? {}), ...r, trader: idOf(r.trader) })
        raw.traderRequirements = [...byId.values()]
      }
      patched.push('traderRequirements')
    }
    if (Array.isArray(ov.taskRequirements)) {
      raw.taskRequirements = ov.taskRequirements.map((r: any) => ({ task: idOf(r.task), status: r.status ?? ['complete'] }))
      patched.push('taskRequirements')
    }
    if (Array.isArray(ov.otherRequirements)) {
      // storyObjective (сюжетная глава) — сохраняем как подсказку; globalVariable оставляем как есть
      const keep = (raw.otherRequirements ?? []).filter((o: any) => o?.type === 'globalVariable')
      raw.otherRequirements = [...keep, ...ov.otherRequirements]
      patched.push('otherRequirements')
    }
    if (ov.objectives && typeof ov.objectives === 'object') {
      for (const o of raw.objectives ?? []) {
        const p = ov.objectives[o.id]
        if (!p) continue
        if (Array.isArray(p.zones) && p.zones.length) {
          o.zones = p.zones.map((z: any, i: number) => ({ id: z.id ?? `overlay:${o.id}:${i}`, map: idOf(z.map), position: z.position, outline: z.outline, top: z.top, bottom: z.bottom }))
          patched.push('zones')
        }
        if (Array.isArray(p.maps)) o.maps = p.maps.map(idOf)
        if (typeof p.count === 'number') o.count = p.count
        if (typeof p.foundInRaid === 'boolean') o.foundInRaid = p.foundInRaid
      }
    }
    if (patched.length) { raw.__patched = [...new Set(patched)]; n++ }
  }
  return n
}
