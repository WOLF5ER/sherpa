/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  Achievement, Barter, Craft, FenceLevel, GameData, GameMap, HideoutStation, Item, ItemBg, Objective, QuestItem, Slot, Task, Trader, XYZ, Zone,
} from './types'
import { OBJECTIVE_PICS, ZONE_FIXES } from './zoneFixes'

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

/**
 * Возможные места квестового предмета (possibleLocations) → метки на карте.
 * Точки одного места обычно лежат в паре метров друг от друга (варианты спавна в одной комнате) — сливаем те,
 * что ближе 12 м, в одну метку со счётчиком; далёкие остаются отдельными.
 */
function itemZones(objectiveId: string, locations: any[]): Zone[] {
  const out: Zone[] = []
  for (const loc of locations ?? []) {
    const map: string = loc?.map
    const pts: XYZ[] = (loc?.positions ?? []).filter((q: any) => q && typeof q.x === 'number')
    if (!map || !pts.length) continue
    const clusters: XYZ[][] = []
    for (const q of pts) {
      const c = clusters.find((cl) => cl.some((r) => Math.hypot(r.x - q.x, r.z - q.z) < 12 && Math.abs(r.y - q.y) < 4))
      if (c) c.push(q); else clusters.push([q])
    }
    clusters.forEach((cl, i) => {
      const n = cl.length
      const position = { x: cl.reduce((a, q) => a + q.x, 0) / n, y: cl.reduce((a, q) => a + q.y, 0) / n, z: cl.reduce((a, q) => a + q.z, 0) / n }
      out.push({ id: `${objectiveId}@${map}#${i}`, map, position, spots: n })
    })
  }
  return out
}

/** Свойства патронов, брони, оружия — только то, что показываем. */
function slots(p: any, t: (k: string) => string): Slot[] | undefined {
  if (!p?.slots?.length) return undefined
  return p.slots.map((s: any): Slot => ({
    id: s.id, nameId: s.nameId ?? '', name: t(s.name ?? s.nameId ?? ''), required: !!s.required,
    allowedItems: s.filters?.allowedItems ?? [], excludedItems: s.filters?.excludedItems ?? [],
  }))
}

const MOD_TYPES = new Set(['ItemPropertiesWeaponMod', 'ItemPropertiesBarrel', 'ItemPropertiesScope', 'ItemPropertiesMagazine', 'ItemPropertiesNightVision'])

function props(p: any, t: (k: string) => string): Partial<Item> {
  if (!p) return {}
  if (MOD_TYPES.has(p.propertiesType)) {
    return {
      mod: {
        ergonomics: p.ergonomics ?? 0, recoilModifier: p.recoilModifier ?? 0, accuracyModifier: p.accuracyModifier ?? 0,
        capacity: p.capacity, zoomLevels: Array.isArray(p.zoomLevels) ? p.zoomLevels.length : p.zoomLevels,
      },
      slots: slots(p, t),
    }
  }
  switch (p.propertiesType) {
    case 'ItemPropertiesPreset':
      return { preset: { baseItem: p.baseItem, ergonomics: p.ergonomics ?? 0, recoilVertical: p.recoilVertical ?? 0, recoilHorizontal: p.recoilHorizontal ?? 0, isDefault: !!p.default } }
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
      // шлемы и забрала тоже имеют слоты (забрало, наушники), но в конструкторе не участвуют
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
        recoilHorizontal: p.recoilHorizontal ?? 0, fireRate: p.fireRate ?? 0, fireModes: p.fireModes ?? [],
        defaultPreset: p.defaultPreset ?? null, presets: p.presets ?? [], allowedAmmo: p.allowedAmmo ?? [],
        defaultErgonomics: p.defaultErgonomics ?? null, defaultRecoilVertical: p.defaultRecoilVertical ?? null, defaultRecoilHorizontal: p.defaultRecoilHorizontal ?? null,
      }, slots: slots(p, t) }
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
      priceScanAt: it.updated ? Date.parse(it.updated) || undefined : undefined,
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
      conflictingItems: it.conflictingItems?.length ? it.conflictingItems : undefined,
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
  let fenceLevels: FenceLevel[] = []
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
    if (t.normalizedName === 'fence') {
      fenceLevels = (t.reputationLevels ?? [])
        .filter((r: any) => typeof r.minimumReputation === 'number' && typeof r.scavCooldownModifier === 'number')
        .map((r: any) => ({ minRep: r.minimumReputation, scavCooldown: r.scavCooldownModifier }))
        .sort((a: FenceLevel, b: FenceLevel) => a.minRep - b.minRep)
    }
  }

  // ── квесты ──
  const tasks: Record<string, Task> = {}
  for (const t of Object.values<any>(raw.tasks.data.tasks)) {
    const objectives: Objective[] = (t.objectives ?? []).map((o: any): Objective => {
      let zones: Zone[] | undefined = o.zones?.length ? o.zones : undefined
      if (!zones && o.possibleLocations?.length) zones = itemZones(o.id, o.possibleLocations)
      const fix = !zones ? ZONE_FIXES[o.id] : undefined
      if (fix) zones = [{ id: `fix:${o.id}`, map: fix.map, position: fix.position }]
      const maps: string[] = o.maps ?? []
      if (zones) for (const z of zones) if (z.map && !maps.includes(z.map)) maps.push(z.map)
      return {
        id: o.id,
        type: o.type,
        description: tTask(o.description),
        optional: !!o.optional,
        maps,
        count: o.count,
        foundInRaid: o.foundInRaid,
        items: o.items ?? (o.item ? [o.item] : undefined),
        questItem: o.questItem ?? undefined,
        zones,
        approx: fix ? true : undefined,
        pics: OBJECTIVE_PICS[o.id],
        skill: o.type === 'skill' && o.skill ? { name: String(o.skill), level: Number(o.level) || 0 } : undefined,
      }
    })
    tasks[t.id] = {
      id: t.id,
      name: tTask(t.name),
      nameEn: raw.tasksEn[t.name] ?? t.name,
      normalizedName: t.normalizedName,
      trader: t.trader,
      map: t.map ?? null,
      minPlayerLevel: t.minPlayerLevel ?? 0,
      taskRequirements: (t.taskRequirements ?? []).map((r: any) => ({ task: r.task, status: r.status ?? ['complete'] })),
      traderRequirements: (t.traderRequirements ?? []).map((r: any) => ({
        trader: r.trader, requirementType: r.requirementType, value: r.value,
      })),
      storyVar: (() => { const g = (t.otherRequirements ?? []).find((o: any) => o?.type === 'globalVariable'); return g ? { id: g.variableId, value: Number(g.value) || 1 } : undefined })(),
      storyGate: (() => {
        const g = (t.otherRequirements ?? []).find((o: any) => o?.type === 'storyObjective')
        return g ? `${g.storyChapter?.name ?? 'сюжет'}: ${g.objective?.name ?? ''}`.trim() : undefined
      })(),
      prestige: t.requiredPrestige ? 1 : undefined, // в json это id престижа, уровень не важен — квест просто вне пула
      patched: t.__patched?.length ? t.__patched : undefined,
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
      unlocksTraders: t.finishRewards?.traderUnlock?.length ? t.finishRewards.traderUnlock.map((x: any) => (typeof x === 'string' ? x : x?.id)).filter(Boolean) : undefined,
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
  const lootContainerTypes: Record<string, string> = {}
  for (const c of Object.values<any>(raw.maps.data.lootContainers ?? {})) {
    lootContainerNames[c.id] = tMap(c.name)
    lootContainerTypes[c.id] = c.normalizedName ?? ''
  }

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
    lootContainerNames, lootContainerTypes, mobNames, achievements, flea, categoryNames,
    scavCooldownSeconds: raw.items.data.settings?.scavCooldownSeconds ?? 1500,
    fenceLevels,
    priceScanAt,
    priceAggregateStale: Date.now() - priceScanAt > 12 * 3600 * 1000,
  }
}
