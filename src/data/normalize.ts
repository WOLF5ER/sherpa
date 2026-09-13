/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  Achievement, Barter, Craft, GameData, GameMap, HideoutStation, Item, ItemBg, Objective, QuestItem, Task, Trader,
} from './types'

type Dict = Record<string, string>

/** Перевод: сначала русский, потом английский, потом сам ключ. */
function makeT(ru: Dict, en: Dict) {
  return (key: string | null | undefined): string => {
    if (!key) return ''
    return ru[key] ?? en[key] ?? key
  }
}

const BG_SET = new Set<ItemBg>(['default', 'black', 'grey', 'blue', 'green', 'yellow', 'orange', 'red', 'violet'])

export interface RawBundle {
  items: any
  itemsRu: Dict
  itemsEn: Dict
  tasks: any
  tasksRu: Dict
  tasksEn: Dict
  maps: any
  mapsRu: Dict
  mapsEn: Dict
  traders: any
  tradersRu: Dict
  tradersEn: Dict
  hideout: any
  hideoutRu: Dict
  hideoutEn: Dict
  crafts: any
  barters: any
}

/** Свойства патронов, брони, оружия — только то, что показываем. */
function props(p: any, t: (k: string) => string): Partial<Item> {
  if (!p) return {}
  switch (p.propertiesType) {
    case 'ItemPropertiesAmmo':
      return { ammo: {
        caliber: p.caliber ?? '', damage: p.damage ?? 0, penetrationPower: p.penetrationPower ?? 0,
        armorDamage: p.armorDamage ?? 0, fragmentationChance: p.fragmentationChance ?? 0, ricochetChance: p.ricochetChance ?? 0,
        initialSpeed: p.initialSpeed ?? 0, projectileCount: p.projectileCount ?? 1, tracer: !!p.tracer,
        accuracyModifier: p.accuracyModifier ?? 0, recoilModifier: p.recoilModifier ?? 0,
        lightBleedModifier: p.lightBleedModifier ?? 0, heavyBleedModifier: p.heavyBleedModifier ?? 0,
      } }
    case 'ItemPropertiesArmor':
    case 'ItemPropertiesHelmet':
    case 'ItemPropertiesChestRig':
    case 'ItemPropertiesArmorAttachment': {
      const kind = p.propertiesType === 'ItemPropertiesArmor' ? 'armor' : p.propertiesType === 'ItemPropertiesHelmet' ? 'helmet'
        : p.propertiesType === 'ItemPropertiesChestRig' ? 'rig' : 'attachment'
      const cls = p.class ?? 0
      const plateSlots = (p.armorSlots ?? []).filter((s: any) => s.allowedPlates?.length).length
      if (kind === 'rig' && !cls && !plateSlots) return {}
      const slotClasses = (p.armorSlots ?? []).map((s: any) => s.class ?? 0)
      return { armor: {
        kind, class: cls || Math.max(0, ...slotClasses), durability: p.durability ?? 0,
        material: t(p.material ?? p.armorMaterial ?? p.armorSlots?.[0]?.armorMaterial ?? '') || '',
        armorType: p.armorType ?? '', speedPenalty: p.speedPenalty ?? 0, turnPenalty: p.turnPenalty ?? 0, ergoPenalty: p.ergoPenalty ?? 0,
        bluntThroughput: p.bluntThroughput ?? 0, zones: (p.zones ?? []).map((z: string) => t(z)), plateSlots, capacity: p.capacity,
      } }
    }
    case 'ItemPropertiesWeapon':
      return { weapon: {
        caliber: p.caliber ?? '', ergonomics: p.ergonomics ?? 0, recoilVertical: p.recoilVertical ?? 0,
        recoilHorizontal: p.recoilHorizontal ?? 0, fireRate: p.fireRate ?? 0, defaultPreset: p.defaultPreset ?? null,
      } }
    case 'ItemPropertiesKey':
      return { keyUses: p.uses ?? 0 }
    default:
      return {}
  }
}

export function normalize(raw: RawBundle): GameData {
  const tItem = makeT(raw.itemsRu, raw.itemsEn)
  const tTask = makeT(raw.tasksRu, raw.tasksEn)
  const tMap = makeT(raw.mapsRu, raw.mapsEn)
  const tTrader = makeT(raw.tradersRu, raw.tradersEn)
  const tHideout = makeT(raw.hideoutRu, raw.hideoutEn)

  // ── предметы ──
  const items: Record<string, Item> = {}
  for (const it of Object.values<any>(raw.items.data.items)) {
    const bg = BG_SET.has(it.backgroundColor) ? it.backgroundColor : 'default'
    items[it.id] = {
      id: it.id,
      name: tItem(it.name),
      shortName: tItem(it.shortName),
      nameEn: raw.itemsEn[it.name] ?? it.normalizedName,
      normalizedName: it.normalizedName,
      width: it.width,
      height: it.height,
      weight: it.weight,
      types: it.types ?? [],
      categories: it.categories ?? [],
      iconLink: it.iconLink,
      gridImageLink: it.gridImageLink,
      wikiLink: it.wikiLink,
      link: it.link,
      bg,
      basePrice: it.basePrice ?? 0,
      lastLowPrice: it.lastLowPrice ?? null,
      avg24hPrice: it.avg24hPrice ?? null,
      low24hPrice: it.low24hPrice ?? null,
      high24hPrice: it.high24hPrice ?? null,
      changeLast48hPercent: it.changeLast48hPercent ?? null,
      lastOfferCount: it.lastOfferCount ?? null,
      minLevelForFlea: it.minLevelForFlea ?? null,
      stackMaxSize: it.stackMaxSize ?? 1,
      sellToTrader: (it.sellToTrader ?? []).map((p: any) => ({
        trader: p.trader, priceRUB: p.priceRUB, price: p.price, currency: p.currency,
      })),
      buyFromTrader: (it.buyFromTrader ?? []).map((p: any) => ({
        trader: p.trader, priceRUB: p.priceRUB, price: p.price, currency: p.currency,
        minTraderLevel: p.minTraderLevel, taskUnlock: p.taskUnlock ?? null,
      })),
      containsItems: (it.containsItems ?? []).map((c: any) => ({ item: c.item, count: c.count })),
      ...props(it.properties, tItem),
    }
  }

  let priceScanAt = 0
  for (const it of Object.values<any>(raw.items.data.items)) {
    const t = it.lastScan ? Date.parse(it.lastScan) : 0
    if (t > priceScanAt) priceScanAt = t
  }

  const categoryNames: Record<string, string> = {}
  for (const c of Object.values<any>(raw.items.data.itemCategories ?? {})) {
    categoryNames[c.id] = tItem(c.name)
  }

  const fm = raw.items.data.fleaMarket ?? {}
  const flea = {
    minPlayerLevel: fm.minPlayerLevel ?? 15,
    sellOfferFeeRate: fm.sellOfferFeeRate ?? 0.05,
    sellRequirementFeeRate: fm.sellRequirementFeeRate ?? 0.05,
  }

  // ── торговцы ──
  const traders: Record<string, Trader> = {}
  const traderList: any[] = Array.isArray(raw.traders.data) ? raw.traders.data : Object.values(raw.traders.data)
  for (const t of traderList) {
    traders[t.id] = {
      id: t.id,
      name: tTrader(t.name),
      normalizedName: t.normalizedName,
      imageLink: t.imageLink,
      currency: t.currency,
      levels: (t.levels ?? []).map((l: any) => ({
        level: l.level, requiredPlayerLevel: l.requiredPlayerLevel, requiredReputation: l.requiredReputation,
      })),
    }
  }

  // ── квесты ──
  const tasks: Record<string, Task> = {}
  for (const t of Object.values<any>(raw.tasks.data.tasks)) {
    const objectives: Objective[] = (t.objectives ?? []).map((o: any): Objective => ({
      id: o.id,
      type: o.type,
      description: tTask(o.description),
      optional: !!o.optional,
      maps: o.maps ?? [],
      count: o.count,
      foundInRaid: o.foundInRaid,
      items: o.items ?? (o.item ? [o.item] : undefined),
      questItem: o.questItem ?? undefined,
      zones: o.zones ?? undefined,
    }))
    tasks[t.id] = {
      id: t.id,
      name: tTask(t.name),
      normalizedName: t.normalizedName,
      trader: t.trader,
      map: t.map ?? null,
      minPlayerLevel: t.minPlayerLevel ?? 0,
      taskRequirements: (t.taskRequirements ?? []).map((r: any) => ({ task: r.task, status: r.status ?? ['complete'] })),
      traderRequirements: (t.traderRequirements ?? []).map((r: any) => ({
        trader: r.trader, requirementType: r.requirementType, value: r.value,
      })),
      objectives,
      kappaRequired: !!t.kappaRequired,
      lightkeeperRequired: !!t.lightkeeperRequired,
      experience: t.experience ?? 0,
      factionName: t.factionName ?? 'Any',
      wikiLink: t.wikiLink,
      taskImageLink: t.taskImageLink ?? null,
      neededKeys: (t.neededKeys ?? []).map((k: any) => ({ keys: k.keys ?? [], map: k.map ?? null })),
      rewardItems: (t.finishRewards?.items ?? []).map((r: any) => ({ item: r.item, count: r.count })),
      rewardStanding: (t.finishRewards?.traderStanding ?? []).map((r: any) => ({ trader: r.trader, standing: r.standing })),
    }
  }

  const questItems: Record<string, QuestItem> = {}
  for (const q of Object.values<any>(raw.tasks.data.questItems ?? {})) {
    questItems[q.id] = {
      id: q.id, name: tTask(q.name), shortName: tTask(q.shortName), iconLink: q.iconLink ?? null,
    }
  }

  const achievements: Achievement[] = Object.values<any>(raw.tasks.data.achievements ?? {}).map((a) => ({
    id: a.id,
    name: tTask(a.name),
    description: tTask(a.description),
    rarity: a.normalizedRarity ?? 'common',
    hidden: !!a.hidden,
    side: a.normalizedSide ?? 'pmc',
    playersCompletedPercent: a.playersCompletedPercent ?? 0,
    imageLink: a.imageLink ?? null,
  }))

  // ── схрон ──
  const stations: Record<string, HideoutStation> = {}
  for (const s of Object.values<any>(raw.hideout.data)) {
    stations[s.id] = {
      id: s.id,
      name: tHideout(s.name),
      normalizedName: s.normalizedName,
      imageLink: s.imageLink,
      levels: (s.levels ?? []).map((l: any) => ({
        id: l.id,
        level: l.level,
        constructionTime: l.constructionTime ?? 0,
        description: tHideout(l.description),
        itemRequirements: (l.itemRequirements ?? []).map((r: any) => ({
          item: r.item, count: r.count, foundInRaid: !!r.attributes?.foundInRaid,
        })),
        stationLevelRequirements: (l.stationLevelRequirements ?? []).map((r: any) => ({ station: r.station, level: r.level })),
        traderRequirements: (l.traderRequirements ?? []).map((r: any) => ({ trader: r.trader, level: r.level ?? r.value })),
        skillRequirements: (l.skillRequirements ?? []).map((r: any) => ({ skill: tHideout(r.skill), level: r.level })),
        bonuses: (l.bonuses ?? []).map((b: any) => ({ name: tHideout(b.name), value: b.value, type: b.type })),
      })),
    }
  }

  // ── крафты и бартеры ──
  const crafts: Craft[] = (raw.crafts.data as any[]).map((c) => ({
    id: c.id,
    station: c.station,
    level: c.level,
    duration: c.duration,
    requiredItems: (c.requiredItems ?? []).map((r: any) => ({ item: r.item, count: r.count, tool: !!r.attributes?.tool })),
    rewardItems: c.productItem ? [{ item: c.productItem.item, count: c.productItem.count }]
      : (c.rewardItems ?? []).map((r: any) => ({ item: r.item, count: r.count })),
    taskUnlock: c.taskUnlock ?? null,
  })).filter((c) => c.rewardItems.length > 0)

  const barters: Barter[] = (raw.barters.data as any[]).map((b) => ({
    id: b.id,
    trader: b.trader,
    level: b.minTraderLevel ?? b.level ?? 1,
    requiredItems: (b.requiredItems ?? []).map((r: any) => ({ item: r.item, count: r.count })),
    rewardItems: b.offeredItem ? [{ item: b.offeredItem.item, count: b.offeredItem.count }]
      : (b.rewardItems ?? []).map((r: any) => ({ item: r.item, count: r.count })),
    taskUnlock: b.taskUnlock ?? null,
  })).filter((b) => b.rewardItems.length > 0)

  // ── карты ──
  const mobNames: Record<string, string> = {}
  for (const m of Object.values<any>(raw.maps.data.mobs ?? {})) mobNames[m.id] = tMap(m.name)
  const lootContainerNames: Record<string, string> = {}
  for (const c of Object.values<any>(raw.maps.data.lootContainers ?? {})) lootContainerNames[c.id] = tMap(c.name)

  const maps: Record<string, GameMap> = {}
  const keyMaps: Record<string, Set<string>> = {}
  for (const m of Object.values<any>(raw.maps.data.maps)) {
    const locks = (m.locks ?? []).map((l: any) => ({
      id: l.id, lockType: l.lockType, key: l.key ?? null, needsPower: !!l.needsPower, position: l.position,
    }))
    for (const l of locks) {
      if (!l.key) continue
      ;(keyMaps[l.key] ??= new Set()).add(m.id)
    }
    maps[m.id] = {
      id: m.id,
      name: tMap(m.name),
      nameEn: raw.mapsEn[m.name] ?? m.normalizedName,
      normalizedName: m.normalizedName,
      nameId: m.nameId,
      raidDuration: m.raidDuration,
      players: m.players,
      coordinateToCardinalRotation: m.coordinateToCardinalRotation ?? 0,
      enemies: (m.enemies ?? []).map((e: string) => tMap(e)),
      wiki: m.wiki,
      spawns: m.spawns ?? [],
      extracts: (m.extracts ?? []).map((e: any) => ({
        id: e.id, name: tMap(e.name), nameEn: raw.mapsEn[e.name] ?? null,
        faction: e.faction === 'pmc' || e.faction === 'scav' || e.faction === 'shared' ? e.faction : 'unknown',
        position: e.position, outline: e.outline,
        // на Таможне все выходы ссылаются на один рубильник — артефакт данных, не показываем
        switches: (m.extracts ?? []).every((x: any) => x.switch && x.switch === e.switch) ? [] : (e.switches ?? []),
        transferItem: e.transferItem?.item ? { item: e.transferItem.item, count: e.transferItem.count ?? 1 } : undefined,
      })),
      bosses: (m.bosses ?? []).map((b: any) => ({
        mob: b.mob,
        name: mobNames[b.mob] ?? b.mob,
        spawnChance: b.spawnChance,
        positions: (b.spawnLocations ?? []).flatMap((s: any) => s.positions ?? []),
        escorts: (b.escorts ?? []).map((e: any) => ({ name: mobNames[e.mob] ?? e.mob, amount: e.amount?.[0]?.count ?? 0 })),
      })),
      locks,
      hazards: (m.hazards ?? []).map((h: any) => ({
        id: h.id, hazardType: h.hazardType, name: tMap(h.name), position: h.position, outline: h.outline,
      })),
      transits: (m.transits ?? []).map((t: any) => ({
        id: t.id, description: tMap(t.description), map: t.map ?? null, position: t.position, outline: t.outline,
      })),
      switches: (m.switches ?? []).map((s: any) => ({ id: s.id, name: tMap(s.name), switchType: s.switchType, position: s.position })),
      btrStops: (m.btrStops ?? []).map((b: any, i: number) => ({ id: b.id ?? String(i), name: tMap(b.name), position: b.position ?? { x: b.x, y: b.y, z: b.z } })).filter((b: any) => Number.isFinite(b.position?.z)),
      stationaryWeapons: (m.stationaryWeapons ?? []).map((w: any) => ({ weapon: w.stationaryWeapon, position: w.position })),
      lootContainers: (m.lootContainers ?? []).map((c: any) => ({ container: c.lootContainer, position: c.position })),
      lootLoose: (m.lootLoose ?? []).map((l: any) => ({ position: l.position, items: l.items ?? [] })),
    }
  }
  for (const [key, set] of Object.entries(keyMaps)) {
    if (items[key]) items[key].keyMaps = [...set]
  }

  return {
    fetchedAt: Date.now(),
    items, traders, tasks, questItems, stations, crafts, barters, maps,
    lootContainerNames, mobNames, achievements, flea, categoryNames,
    scavCooldownSeconds: raw.items.data.settings?.scavCooldownSeconds ?? 1500,
    priceScanAt,
    priceAggregateStale: Date.now() - priceScanAt > 12 * 3600 * 1000,
  }
}
