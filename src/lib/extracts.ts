import type { Extract, GameData, GameMap } from '@/data/types'
import { EXTRACT_RULES, extractLabel, isLegacyExtract, ruleFor, type ExtractRule } from '@/data/extractRules'
import { ROUBLES } from '@/data/types'
import type { GameMode } from '@/data/loader'

export interface ExtractInfo {
  id: string
  label: string
  faction: 'pmc' | 'scav' | 'shared' | 'unknown'
  /** короткая пометка на карте */
  tag: string | null
  /** полное условие */
  req: string | null
  note: string | null
  notAlways: boolean
  single: boolean
  /** ids предметов, которые нужно взять с собой */
  items: string[]
  /** только по вики — без координат */
  missing: boolean
  /** доступен только в этом режиме */
  onlyMode: GameMode | null
  extract: Extract | null
}

function itemIdByNormalized(data: GameData, normalized: string): string | null {
  for (const it of Object.values(data.items)) if (it.normalizedName === normalized) return it.id
  return null
}

let cache: { data: GameData; ids: Map<string, string | null> } | null = null
function resolveItem(data: GameData, normalized: string): string | null {
  if (cache?.data !== data) cache = { data, ids: new Map() }
  if (!cache.ids.has(normalized)) cache.ids.set(normalized, itemIdByNormalized(data, normalized))
  return cache.ids.get(normalized) ?? null
}

function fromRule(data: GameData, e: Extract | null, rule: ExtractRule | undefined, label: string): ExtractInfo {
  const items: string[] = []
  let req = rule?.req ?? null
  let tag = rule?.tag ?? null
  // данные знают предмет для передачи — деньги или записка; вики-правило его только уточняет
  if (e?.transferItem) {
    const it = data.items[e.transferItem.item]
    if (it) {
      if (e.transferItem.item !== ROUBLES) items.push(it.id)
      const money = e.transferItem.item === ROUBLES
      const text = money ? `${e.transferItem.count.toLocaleString('ru-RU')} ₽ за место` : it.name
      if (!tag) tag = money ? `${Math.round(e.transferItem.count / 1000)} 000 ₽` : it.shortName
      if (!req) req = text
    }
  }
  for (const n of rule?.items ?? []) {
    const id = resolveItem(data, n)
    if (id && !items.includes(id)) items.push(id)
  }
  return {
    id: e?.id ?? `wiki:${rule?.name}`,
    label,
    faction: rule?.faction ?? e?.faction ?? 'unknown',
    tag, req,
    note: rule?.note ?? null,
    notAlways: !!rule?.notAlways,
    single: !!rule?.single,
    items,
    missing: !e,
    onlyMode: rule?.kind?.includes('pve') ? 'pve' : rule?.kind?.includes('pvp') ? 'regular' : null,
    extract: e,
  }
}

/** Выходы карты с условиями: данные + вики-справочник, без легаси-мусора; плюс выходы, которых нет в данных. */
export function extractsOf(data: GameData, map: GameMap, mode: GameMode = 'regular'): ExtractInfo[] {
  const out: ExtractInfo[] = []
  const seen = new Set<string>()
  for (const e of map.extracts) {
    if (isLegacyExtract(e)) continue
    const rule = e.nameEn ? ruleFor(map.normalizedName, e.nameEn) : undefined
    out.push(fromRule(data, e, rule, extractLabel(e)))
    if (e.nameEn) seen.add(e.nameEn)
  }
  for (const rule of EXTRACT_RULES[map.normalizedName] ?? []) {
    if (!rule.missing || seen.has(rule.name)) continue
    out.push(fromRule(data, null, rule, RU_MISSING[rule.name] ?? rule.name))
  }
  // PvE-выходы не показываем PvP-игроку и наоборот; в своём режиме пометка «только PvE» лишняя
  return out
    .filter((x) => !x.onlyMode || x.onlyMode === mode)
    .map((x) => (x.onlyMode ? { ...x, tag: null, req: null } : x))
}

/** Русские имена для выходов, которых нет в данных tarkov.dev. */
const RU_MISSING: Record<string, string> = {
  'Friendship Bridge (Co-Op)': 'Мост дружбы (Совм.)',
  'D-2': 'Д-2',
  'Railway Bridge': 'ЖД-мост',
  'Road to Military Base V-Ex': 'А-Выход дорога к военной базе',
  'Side Tunnel (Co-Op)': 'Боковой тоннель (Совм.)',
  'Industrial Zone Gates': 'Ворота промзоны',
  'Hideout Under the Landing Stage': 'Укрытие под пристанью',
  'Southern Road': 'Южная дорога',
  'Medical Block Elevator': 'Лифт медблока',
  'Zubr Boat': 'Катер «Зубр»',
  'Helicopter': 'Вертолёт',
}

export const FACTION_RU: Record<ExtractInfo['faction'], string> = { pmc: 'ЧВК', scav: 'дикие', shared: 'общий', unknown: 'фракция не указана' }
