// Нормализованные типы данных tarkov.dev (после обрезки и перевода)

export type ItemBg =
  | 'default' | 'black' | 'grey' | 'blue' | 'green'
  | 'yellow' | 'orange' | 'red' | 'violet'

export interface TraderPrice {
  trader: string
  priceRUB: number
  price: number
  currency: string
  minTraderLevel?: number
  taskUnlock?: string | null
}

export interface Item {
  id: string
  name: string
  shortName: string
  nameEn: string
  normalizedName: string
  width: number
  height: number
  weight: number
  types: string[]
  categories: string[]
  iconLink: string
  gridImageLink: string
  wikiLink: string
  link: string
  bg: ItemBg
  basePrice: number
  lastLowPrice: number | null
  avg24hPrice: number | null
  low24hPrice: number | null
  high24hPrice: number | null
  changeLast48hPercent: number | null
  lastOfferCount: number | null
  minLevelForFlea: number | null
  stackMaxSize: number
  sellToTrader: TraderPrice[]
  buyFromTrader: TraderPrice[]
  /** содержимое пресета/сборки — для «продать по частям» */
  containsItems: { item: string; count: number }[]
  /** для ключей: на каких картах используется (заполняется из maps.locks) */
  keyMaps?: string[]
  /** время последней точки истории, если цена обновлена точечно (см. data/prices.ts) */
  priceFresh?: number
  ammo?: AmmoProps
  armor?: ArmorProps
  weapon?: WeaponProps
  keyUses?: number
}

export interface AmmoProps {
  caliber: string
  damage: number
  penetrationPower: number
  armorDamage: number
  fragmentationChance: number
  ricochetChance: number
  initialSpeed: number
  projectileCount: number
  tracer: boolean
  accuracyModifier: number
  recoilModifier: number
  lightBleedModifier: number
  heavyBleedModifier: number
}

export interface ArmorProps {
  kind: 'armor' | 'helmet' | 'rig' | 'attachment'
  class: number
  durability: number
  material: string
  armorType: string
  speedPenalty: number
  turnPenalty: number
  ergoPenalty: number
  bluntThroughput: number
  zones: string[]
  /** сколько слотов под плиты (для бронежилетов/разгрузок нового образца) */
  plateSlots: number
  capacity?: number
}

export interface WeaponProps {
  caliber: string
  ergonomics: number
  recoilVertical: number
  recoilHorizontal: number
  fireRate: number
  defaultPreset: string | null
}

export interface Trader {
  id: string
  name: string
  normalizedName: string
  imageLink: string
  currency: string
  levels: { level: number; requiredPlayerLevel: number; requiredReputation: number }[]
}

export type ObjectiveType =
  | 'giveItem' | 'findItem' | 'plantItem' | 'findQuestItem' | 'giveQuestItem' | 'plantQuestItem'
  | 'visit' | 'extract' | 'shoot' | 'mark' | 'skill' | 'traderLevel' | 'traderStanding'
  | 'buildWeapon' | 'experience' | 'taskStatus' | 'useItem' | 'sellItem' | 'dialogue' | 'globalVariable'

export interface Zone {
  id: string
  map: string
  position: XYZ
  outline?: XYZ[]
  top?: number
  bottom?: number
}

export interface Objective {
  id: string
  type: ObjectiveType
  description: string
  optional: boolean
  maps: string[]
  count?: number
  foundInRaid?: boolean
  /** альтернативы (любой из) */
  items?: string[]
  questItem?: string
  zones?: Zone[]
  /** для plantQuestItem/giveQuestItem: имя квестового предмета */
}

export interface TaskRequirement {
  task: string
  status: string[]
}

export interface Task {
  id: string
  name: string
  normalizedName: string
  trader: string
  map: string | null
  minPlayerLevel: number
  taskRequirements: TaskRequirement[]
  traderRequirements: { trader: string; requirementType: string; value: number }[]
  objectives: Objective[]
  kappaRequired: boolean
  lightkeeperRequired: boolean
  experience: number
  factionName: 'Any' | 'USEC' | 'BEAR'
  wikiLink: string
  taskImageLink: string | null
  neededKeys: { keys: string[]; map: string | null }[]
  rewardItems: { item: string; count: number }[]
  rewardStanding: { trader: string; standing: number }[]
}

export interface QuestItem {
  id: string
  name: string
  shortName: string
  iconLink: string | null
}

export interface HideoutLevel {
  id: string
  level: number
  constructionTime: number
  description: string
  itemRequirements: { item: string; count: number; foundInRaid: boolean }[]
  stationLevelRequirements: { station: string; level: number }[]
  traderRequirements: { trader: string; level: number }[]
  skillRequirements: { skill: string; level: number }[]
  bonuses: { name: string; value: number; type: string }[]
}

export interface HideoutStation {
  id: string
  name: string
  normalizedName: string
  imageLink: string
  levels: HideoutLevel[]
}

export interface Craft {
  id: string
  station: string
  level: number
  duration: number
  requiredItems: { item: string; count: number; tool: boolean }[]
  rewardItems: { item: string; count: number }[]
  taskUnlock: string | null
}

export interface Barter {
  id: string
  trader: string
  level: number
  requiredItems: { item: string; count: number }[]
  rewardItems: { item: string; count: number }[]
  taskUnlock: string | null
}

export interface XYZ { x: number; y: number; z: number }

export interface Extract {
  id: string
  name: string
  /** английское имя (ключ для справочника условий); null — перевода нет вовсе */
  nameEn: string | null
  faction: 'pmc' | 'scav' | 'shared' | 'unknown'
  position: XYZ
  outline?: XYZ[]
  switches: string[]
  /** что нужно передать для выхода (деньги, записка, карта минных полей) */
  transferItem?: { item: string; count: number }
}

export interface MapSpawn {
  position: XYZ
  sides: string[]
  categories: string[]
  zoneName: string
}

export interface MapBoss {
  mob: string
  name: string
  spawnChance: number
  positions: XYZ[]
  escorts: { name: string; amount: number }[]
}

export interface MapLock {
  id: string
  lockType: string
  key: string | null
  needsPower: boolean
  position: XYZ
}

export interface MapHazard {
  id: string
  hazardType: string
  name: string
  position: XYZ
  outline?: XYZ[]
}

export interface MapTransit {
  id: string
  description: string
  map: string | null
  position: XYZ
  outline?: XYZ[]
}

export interface MapSwitch {
  id: string
  name: string
  switchType: string
  position: XYZ
}

export interface GameMap {
  id: string
  name: string
  nameEn: string
  normalizedName: string
  nameId: string
  raidDuration: number
  players: string
  /** поворот игровых координат относительно сторон света */
  coordinateToCardinalRotation: number
  enemies: string[]
  wiki: string
  spawns: MapSpawn[]
  extracts: Extract[]
  bosses: MapBoss[]
  locks: MapLock[]
  hazards: MapHazard[]
  transits: MapTransit[]
  switches: MapSwitch[]
  btrStops: { id: string; name: string; position: XYZ }[]
  stationaryWeapons: { weapon: string; position: XYZ }[]
  lootContainers: { container: string; position: XYZ }[]
  /** точки лута: предмет → координаты (разрежённо, для поиска «где лежит») */
  lootLoose: { position: XYZ; items: string[] }[]
}

export interface Achievement {
  id: string
  name: string
  description: string
  rarity: 'common' | 'rare' | 'legendary' | 'seasonal' | string
  hidden: boolean
  side: string
  playersCompletedPercent: number
  imageLink: string | null
}

export interface FleaSettings {
  minPlayerLevel: number
  sellOfferFeeRate: number
  sellRequirementFeeRate: number
}

export interface GameData {
  fetchedAt: number
  items: Record<string, Item>
  traders: Record<string, Trader>
  tasks: Record<string, Task>
  questItems: Record<string, QuestItem>
  stations: Record<string, HideoutStation>
  crafts: Craft[]
  barters: Barter[]
  maps: Record<string, GameMap>
  lootContainerNames: Record<string, string>
  mobNames: Record<string, string>
  achievements: Achievement[]
  flea: FleaSettings
  categoryNames: Record<string, string>
  scavCooldownSeconds: number
  /** последний скан барахолки в сводном файле */
  priceScanAt: number
  /** сводка старше 12 ч — цены надо подтягивать по истории поштучно */
  priceAggregateStale: boolean
}

export const ROUBLES = '5449016a4bdc2d6f028b456f'
export const DOLLARS = '5696686a4bdc2da3298b456a'
export const EUROS = '569668774bdc2da2298b4568'
