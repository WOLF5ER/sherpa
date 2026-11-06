/**
 * Общие для большой карты и мини-карты настройки слоёв и константы лута.
 * Тумблеры хранятся в localStorage 'sherpa:mapToggles2' — главное окно пишет,
 * мини-карта (и телефон) читают те же значения, слои совпадают один в один.
 */

export type ToggleKey =
  | 'exitsPmc' | 'exitsScav' | 'exitsShared' | 'transits'
  | 'quests'
  | 'spawnsPmc' | 'spawnsScav' | 'snipers' | 'spawnsSeason' | 'bosses'
  | 'locks' | 'keySpawns' | 'keycards' | 'ledx'
  | 'bpDocs'
  | 'containers' | 'loose'
  | 'hazards' | 'switches' | 'weapons' | 'btr'
export type Toggles = Record<ToggleKey, boolean>

export const DEFAULT_TOGGLES: Toggles = {
  exitsPmc: true, exitsScav: false, exitsShared: true, transits: true,
  quests: true,
  spawnsPmc: true, spawnsScav: false, snipers: false, spawnsSeason: true, bosses: true,
  locks: true, keySpawns: false, keycards: false, ledx: false, bpDocs: false,
  containers: false, loose: false,
  hazards: true, switches: false, weapons: false, btr: true,
}

export const readToggles = (): Toggles => {
  try { return { ...DEFAULT_TOGGLES, ...JSON.parse(localStorage.getItem('sherpa:mapToggles2') ?? '{}') } }
  catch { return DEFAULT_TOGGLES }
}

/** категории рассыпного лута — по категориям предметов tarkov.dev (id ветки; предмет попадает, если ветка среди его categories) */
export const LOOSE_CATEGORIES: { id: string; label: string; cats?: string[] }[] = [
  { id: 'all', label: 'Весь лут' },
  { id: 'needed', label: 'Нужное мне' },
  { id: 'barter', label: 'Ценности и бартер', cats: ['5448eb774bdc2d0a728b4567', '5448ecbe4bdc2d60728b4568'] },
  { id: 'cases', label: 'Кейсы', cats: ['566162e44bdc2d3f298b4573'] },
  { id: 'keys', label: 'Ключи', cats: ['5c99f98d86f7745c314214b3'] },
  { id: 'meds', label: 'Медицина', cats: ['543be5664bdc2dd4348b4569'] },
  { id: 'food', label: 'Еда и вода', cats: ['543be6674bdc2df1348b4569'] },
  { id: 'other', label: 'Прочее' },
]
/** механические ключи (ветка mechanical-key); ключ-карты — отдельная ветка keycard, в «ключах» их нет */
export const KEY_CATEGORY = '5c99f98d86f7745c314214b3'
export const KEYCARD_CATEGORY = '5c164d2286f774194c5e69fa'
/** ключ-карты: свой цвет у каждой; порядок — по ценности (в точке с несколькими картами маркер красится по первой) */
export const KEYCARDS: { id: string; label: string; color: string }[] = [
  { id: '5c1d0efb86f7744baf2e7b7b', label: 'Красная', color: '#e04b4b' },
  { id: '5c1d0f4986f7744bb01837fa', label: 'Чёрная', color: '#3a3f47' },
  { id: '5c1e495a86f7743109743dfb', label: 'Фиолетовая', color: '#a05be0' },
  { id: '5c1d0c5f86f7744bb2683cf0', label: 'Синяя', color: '#4b8be0' },
  { id: '5c1d0dc586f7744baf2e7b79', label: 'Зелёная', color: '#4bc46b' },
  { id: '5c1d0d6d86f7744bb2683e1f', label: 'Жёлтая', color: '#e8c84b' },
  { id: '5c94bbff86f7747ee735c08f', label: 'Доступ в Лабораторию', color: '#5fd0d0' },
  { id: '6711039f9e648049e50b3307', label: 'Жилой блок (Лаборатория)', color: '#7c8a80' },
  { id: '5e42c81886f7742a01529f57', label: 'Объект #11SR', color: '#e08a3c' },
  { id: '5e42c83786f7742a021fdf3c', label: 'Объект #21WS', color: '#d66fb0' },
]
export const KEYCARD_COLORS = Object.fromEntries(KEYCARDS.map((k) => [k.id, k.color]))
export const isKeycard = (it: { categories: string[] } | undefined) => !!it?.categories.includes(KEYCARD_CATEGORY)
export const LEDX = '5c0530ee86f774697952d952'
