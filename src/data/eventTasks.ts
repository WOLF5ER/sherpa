import type { GameData, Objective, ObjectiveType, Task } from './types'

/**
 * Ивент «Хэллоуин 2026» (старт 29.10.2026): 19 заданий Лыжника и Терапевта с развилкой сторон.
 * В данных tarkov.dev их нет. Источники:
 *   • цепочка, торговцы, карты — русская вики (escapefromtarkov.fandom.com/ru, страницы Halloween:*);
 *   • цели и количества — tarkovquestie.com (JSON-LD со списком заданий), сверено с описаниями на вики.
 *
 * У двух заданий («Усиление карантина», «Новая вакцина») в игре есть по два варианта — они зависят от того,
 * кому первому отдали вакцину. Здесь базовый вариант, разница описана в подсказке.
 *
 * Когда tarkov.dev выложит ивент — задания не подмешаются (см. mergeEventTasks: сверка по nameEn),
 * а когда ивент кончится — достаточно вписать дату в EVENT_ENDS или погасить чип «Событие».
 */

export const EVENT_ID = 'halloween-2026'
export const EVENT_LABEL = 'Хэллоуин 2026'
/** Ивент стартовал 29.10.2026; дату окончания BSG не объявляла — как объявит, вписать сюда (ISO). */
export const EVENT_STARTED = '2026-10-29'
export const EVENT_ENDS: string | null = null

/** Ивент ещё идёт (по дате). Если дата не задана — считаем, что идёт. */
export function eventActive(now = Date.now()): boolean {
  return !EVENT_ENDS || now <= Date.parse(EVENT_ENDS)
}

const T = {
  skier: '58330581ace78e27b8b10cee',
  therapist: '54cb57776803fa99248b456e',
}

interface Obj {
  type: ObjectiveType
  d: string
  count?: number
  optional?: boolean
}

interface Def {
  id: string
  name: string
  nameEn: string
  trader: string
  after?: string[]
  locations: string[]
  wiki: string
  /** подсказка по механике (например, развилка сторон) */
  hint?: string
  objectives: Obj[]
}

const DEFS: Def[] = [
  {
    id: 'hw-sluhi', name: 'Хэллоуин: Слухи', nameEn: 'Halloween: Rumors',
    trader: T.skier,
    locations: ['Заражённый Завод'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%A1%D0%BB%D1%83%D1%85%D0%B8',
    objectives: [
      { type: 'visit', d: 'Побывать на Заражённом Заводе' },
      { type: 'shoot', d: 'Уничтожить заражённых на Заражённом Заводе', count: 10 },
    ],
  },
  {
    id: 'hw-luchshaya-zaschita', name: 'Хэллоуин: Лучшая защита', nameEn: 'Halloween: The Best Defense',
    trader: T.skier,
    after: ['hw-sluhi'],
    locations: ['Заражённая Лаборатория'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%9B%D1%83%D1%87%D1%88%D0%B0%D1%8F_%D0%B7%D0%B0%D1%89%D0%B8%D1%82%D0%B0',
    objectives: [
      { type: 'visit', d: 'Побывать в Заражённой Лаборатории' },
      { type: 'shoot', d: 'Уничтожить заражённых в Заражённой Лаборатории', count: 10 },
      { type: 'extract', d: 'Выжить и выйти из Заражённой Лаборатории', optional: true },
      { type: 'findItem', d: 'Найти особый предмет для открытия выхода', optional: true },
    ],
  },
  {
    id: 'hw-kontrolnaya-proverka', name: 'Хэллоуин: Контрольная проверка', nameEn: 'Halloween: Follow-Up Examination',
    trader: T.therapist,
    after: ['hw-luchshaya-zaschita'],
    locations: ['Заражённый Завод', 'Заражённая Лаборатория'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%9A%D0%BE%D0%BD%D1%82%D1%80%D0%BE%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F_%D0%BF%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%BA%D0%B0',
    objectives: [
      { type: 'findQuestItem', d: 'Найти тело учёного в химзащите в Заражённой Лаборатории или на Заражённом Заводе' },
      { type: 'useItem', d: 'Вскрыть тело медицинскими инструментами' },
      { type: 'findQuestItem', d: 'Забрать образец крови' },
      { type: 'giveQuestItem', d: 'Передать образец крови' },
    ],
  },
  {
    id: 'hw-neozhidannaya-pomosch', name: 'Хэллоуин: Неожиданная помощь', nameEn: 'Halloween: Unexpected Help',
    trader: T.skier,
    after: ['hw-kontrolnaya-proverka'],
    locations: ['Маяк', 'Таможня'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%9D%D0%B5%D0%BE%D0%B6%D0%B8%D0%B4%D0%B0%D0%BD%D0%BD%D0%B0%D1%8F_%D0%BF%D0%BE%D0%BC%D0%BE%D1%89%D1%8C',
    objectives: [
      { type: 'findQuestItem', d: 'Найти и забрать партию вакцины на водоочистной станции (Маяк)' },
      { type: 'plantQuestItem', d: 'Спрятать партию вакцины в комнате 105 двухэтажного общежития (Таможня)' },
    ],
  },
  {
    id: 'hw-pervichnaya-proverka', name: 'Хэллоуин: Первичная проверка', nameEn: 'Halloween: Initial Examination',
    trader: T.therapist,
    after: ['hw-neozhidannaya-pomosch'],
    locations: ['Маяк'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%9F%D0%B5%D1%80%D0%B2%D0%B8%D1%87%D0%BD%D0%B0%D1%8F_%D0%BF%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%BA%D0%B0',
    objectives: [{ type: 'giveQuestItem', d: 'Передать партию вакцины' }],
  },
  {
    id: 'hw-usilenie-karantina', name: 'Хэллоуин: Усиление карантина', nameEn: 'Halloween: Tightening the Quarantine',
    trader: T.skier,
    after: ['hw-novaya-vakcina'],
    locations: [],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%A3%D1%81%D0%B8%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5_%D0%BA%D0%B0%D1%80%D0%B0%D0%BD%D1%82%D0%B8%D0%BD%D0%B0',
    hint: 'Ветка зависит от того, кому первому отдали вакцину: 5/2/2 или 7/3/3.',
    objectives: [
      { type: 'giveItem', d: 'Передать найденные в рейде аптечки, снимающие сильное кровотечение', count: 5 },
      { type: 'giveItem', d: 'Передать найденные в рейде медицинские бальзамы', count: 2 },
      { type: 'giveItem', d: 'Передать найденные в рейде хирургические наборы', count: 2 },
    ],
  },
  {
    id: 'hw-novaya-vakcina', name: 'Хэллоуин: Новая вакцина', nameEn: 'Halloween: A New Vaccine',
    trader: T.therapist,
    after: ['hw-pervichnaya-proverka'],
    locations: ['Заражённый Завод', 'Заражённая Лаборатория'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%9D%D0%BE%D0%B2%D0%B0%D1%8F_%D0%B2%D0%B0%D0%BA%D1%86%D0%B8%D0%BD%D0%B0',
    hint: 'Ветка зависит от того, кому первому отдали вакцину: выйти с обеих карт или только с одной.',
    objectives: [
      { type: 'extract', d: 'Выжить и выйти с Заражённого Завода' },
      { type: 'extract', d: 'Выжить и выйти из Заражённой Лаборатории' },
      { type: 'findItem', d: 'Найти особый предмет для открытия выхода', optional: true },
      { type: 'giveItem', d: 'Передать 2000 долларов', count: 2000 },
    ],
  },
  {
    id: 'hw-zona-riska', name: 'Хэллоуин: Зона Риска', nameEn: 'Halloween: Danger Zone',
    trader: T.skier,
    after: ['hw-usilenie-karantina'],
    locations: ['Эпицентр', 'Таможня', 'Лес', 'Развязка', 'Берег', 'Улицы Таркова', 'Маяк', 'Резерв'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%97%D0%BE%D0%BD%D0%B0_%D0%A0%D0%B8%D1%81%D0%BA%D0%B0',
    objectives: [
      { type: 'shoot', d: 'Уничтожить любую цель на Эпицентре или Таможне', count: 15 },
      { type: 'shoot', d: 'Уничтожить любую цель на Лесе или Развязке', count: 15 },
      { type: 'shoot', d: 'Уничтожить любую цель на Берегу или Улицах Таркова', count: 15 },
      { type: 'shoot', d: 'Уничтожить любую цель на Маяке или Резерве', count: 15 },
    ],
  },
  {
    id: 'hw-sovpadenie', name: 'Хэллоуин: Совпадение?', nameEn: 'Halloween: Coincidence?',
    trader: T.skier,
    after: ['hw-zona-riska'],
    locations: ['Маяк'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%A1%D0%BE%D0%B2%D0%BF%D0%B0%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5%3F',
    objectives: [
      { type: 'findQuestItem', d: 'Найти источник сигнала на Маяке' },
      { type: 'findItem', d: 'Собрать улики рядом' },
      { type: 'giveItem', d: 'Передать найденную улику' },
    ],
  },
  {
    id: 'hw-prototipirovanie', name: 'Хэллоуин: Прототипирование', nameEn: 'Halloween: Prototyping',
    trader: T.skier,
    after: ['hw-zona-riska'],
    locations: [],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%9F%D1%80%D0%BE%D1%82%D0%BE%D1%82%D0%B8%D0%BF%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5',
    objectives: [
      { type: 'findQuestItem', d: 'Добыть прототип вакцины TG-Vi-24', count: 2 },
      { type: 'giveItem', d: 'Передать прототипы', count: 2 },
    ],
  },
  {
    id: 'hw-vrag-moego-vraga', name: 'Хэллоуин: Враг моего врага', nameEn: 'Halloween: Enemy of My Enemy',
    trader: T.skier,
    after: ['hw-sovpadenie'],
    locations: [],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%92%D1%80%D0%B0%D0%B3_%D0%BC%D0%BE%D0%B5%D0%B3%D0%BE_%D0%B2%D1%80%D0%B0%D0%B3%D0%B0',
    objectives: [{ type: 'giveQuestItem', d: 'Передать улики Терапевту' }],
  },
  {
    id: 'hw-vrag-moego-vraga-dogovor', name: 'Хэллоуин: Враг моего врага. Договор', nameEn: 'Halloween: Enemy of My Enemy - An Agreement',
    trader: T.therapist,
    after: ['hw-vrag-moego-vraga'],
    locations: [],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%92%D1%80%D0%B0%D0%B3_%D0%BC%D0%BE%D0%B5%D0%B3%D0%BE_%D0%B2%D1%80%D0%B0%D0%B3%D0%B0._%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80',
    hint: 'Развилка: ивент даёт выбрать сторону — эта ветка закрывает «Ослепить противника».',
    objectives: [
      { type: 'giveQuestItem', d: 'Передать улику' },
      { type: 'findItem', d: 'Добыть улику о вирусе', optional: true },
    ],
  },
  {
    id: 'hw-oslepit-protivnika', name: 'Хэллоуин: Ослепить противника', nameEn: 'Halloween: Blind the Enemy',
    trader: T.skier,
    after: ['hw-vrag-moego-vraga'],
    locations: ['Лес', 'Таможня', 'Маяк', 'Резерв', 'Берег'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%9E%D1%81%D0%BB%D0%B5%D0%BF%D0%B8%D1%82%D1%8C_%D0%BF%D1%80%D0%BE%D1%82%D0%B8%D0%B2%D0%BD%D0%B8%D0%BA%D0%B0',
    hint: 'Развилка: ивент даёт выбрать сторону — эта ветка закрывает «Враг моего врага. Договор».',
    objectives: [
      { type: 'giveItem', d: 'Передать вакцину RDA-78' },
      { type: 'shoot', d: 'Уничтожить камеры у депо (Лес)', count: 2 },
      { type: 'shoot', d: 'Уничтожить камеры в общежитии (Таможня)', count: 3 },
      { type: 'shoot', d: 'Уничтожить камеры на водоочистной (Маяк)', count: 3 },
      { type: 'shoot', d: 'Уничтожить камеры у депо (Резерв)', count: 3 },
      { type: 'shoot', d: 'Уничтожить камеры в санатории (Берег)', count: 3 },
    ],
  },
  {
    id: 'hw-highrisk-highreward', name: 'Хэллоуин: High-Risk, High-Reward', nameEn: 'Halloween: High-Risk, High-Reward',
    trader: T.therapist,
    after: ['hw-novaya-vakcina'],
    locations: ['Заражённый Завод', 'Заражённая Лаборатория'],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_High-Risk%2C_High-Reward',
    objectives: [
      { type: 'shoot', d: 'Уничтожить заражённых на Заражённом Заводе или в Заражённой Лаборатории', count: 30 },
    ],
  },
  {
    id: 'hw-pervye-rezultaty', name: 'Хэллоуин: Первые результаты', nameEn: 'Halloween: First Results',
    trader: T.therapist,
    after: ['hw-highrisk-highreward'],
    locations: [],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%9F%D0%B5%D1%80%D0%B2%D1%8B%D0%B5_%D1%80%D0%B5%D0%B7%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%82%D1%8B',
    objectives: [
      { type: 'shoot', d: 'Уничтожить заражённых под действием экспериментальной газовой гранаты', count: 25 },
      { type: 'findItem', d: 'Добыть экспериментальную газовую гранату RDA-68', optional: true },
    ],
  },
  {
    id: 'hw-izuchenie-vraga', name: 'Хэллоуин: Изучение врага', nameEn: 'Halloween: Studying the Enemy',
    trader: T.therapist,
    after: ['hw-highrisk-highreward'],
    locations: [],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%98%D0%B7%D1%83%D1%87%D0%B5%D0%BD%D0%B8%D0%B5_%D0%B2%D1%80%D0%B0%D0%B3%D0%B0',
    objectives: [{ type: 'giveQuestItem', d: 'Передать образцы тканей заражённых', count: 2 }],
  },
  {
    id: 'hw-radi-obschey-celi', name: 'Хэллоуин: Ради общей цели', nameEn: 'Halloween: For the Greater Good',
    trader: T.therapist,
    after: ['hw-pervye-rezultaty'],
    locations: [],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%A0%D0%B0%D0%B4%D0%B8_%D0%BE%D0%B1%D1%89%D0%B5%D0%B9_%D1%86%D0%B5%D0%BB%D0%B8',
    objectives: [{ type: 'giveQuestItem', d: 'Передать данные об инфекции Лыжнику' }],
  },
  {
    id: 'hw-radi-obschey-celi-dogovor', name: 'Хэллоуин: Ради общей цели. Договор', nameEn: 'Halloween: For the Greater Good - An Agreement',
    trader: T.skier,
    after: ['hw-radi-obschey-celi'],
    locations: [],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%A0%D0%B0%D0%B4%D0%B8_%D0%BE%D0%B1%D1%89%D0%B5%D0%B9_%D1%86%D0%B5%D0%BB%D0%B8._%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80',
    hint: 'Развилка: ивент даёт выбрать сторону — эта ветка закрывает «Последний рывок».',
    objectives: [{ type: 'giveQuestItem', d: 'Передать данные об инфекции' }],
  },
  {
    id: 'hw-posledniy-ryvok', name: 'Хэллоуин: Последний рывок', nameEn: 'Halloween: The Final Push',
    trader: T.therapist,
    after: ['hw-radi-obschey-celi'],
    locations: [],
    wiki: 'https://escapefromtarkov.fandom.com/ru/wiki/Halloween%3A_%D0%9F%D0%BE%D1%81%D0%BB%D0%B5%D0%B4%D0%BD%D0%B8%D0%B9_%D1%80%D1%8B%D0%B2%D0%BE%D0%BA',
    hint: 'Развилка: ивент даёт выбрать сторону — эта ветка закрывает «Ради общей цели. Договор».',
    objectives: [
      { type: 'shoot', d: 'Уничтожить заражённых под действием экспериментальной газовой гранаты', count: 30 },
      { type: 'findItem', d: 'Добыть экспериментальную газовую гранату RDA-78', optional: true },
      { type: 'shoot', d: 'Уничтожить Заражённого Тагиллу' },
    ],
  },
]

/**
 * Награды по заданиям (tarkovquestie.com): id → опыт и предметы.
 * Названия английские — id предмета подставляется из справочника при слиянии (data.items).
 * У парных заданий («Усиление карантина», «Новая вакцина») взят базовый вариант.
 */
const REWARDS: Record<string, { xp: number; items: [name: string, count: number][] }> = {
  'hw-sluhi': { xp: 26000, items: [['MPS Auto Assault-12 Gen 2 12ga automatic shotgun', 1], ['AA-12 12ga 20-round drum magazine', 3], ['12/70 SuperFormance HP slug ammo pack (25 pcs)', 4]] },
  'hw-luchshaya-zaschita': { xp: 36000, items: [['Norinco QBZ-191 5.8x42 assault rifle', 1], ['QBZ-191 5.8x42 30-round magazine', 3], ['5.8x42mm DBX95 ammo pack (30 pcs)', 4]] },
  'hw-kontrolnaya-proverka': { xp: 40000, items: [['TerraGroup Labs access keycard', 2], ['Adrenaline injector', 2], ['Trimadol stimulant injector', 2]] },
  'hw-neozhidannaya-pomosch': { xp: 38000, items: [['Ammunition case', 1]] },
  'hw-pervichnaya-proverka': { xp: 38000, items: [['Document case', 1]] },
  'hw-usilenie-karantina': { xp: 41000, items: [['Kalashnikov AK-12 5.45x39 assault rifle', 1], ['AK-12 5.45x39 early model 30-round magazine', 3], ['5.45x39mm 7N40 ammo pack (120 pcs)', 1]] },
  'hw-novaya-vakcina': { xp: 48000, items: [['Mr. Holodilnick thermal bag', 1]] },
  'hw-zona-riska': { xp: 44000, items: [['Weapon repair kit', 1], ['IOTV Gen4 body armor (Full Protection Kit, MultiCam)', 1], ['Infected tissue sample', 2]] },
  'hw-sovpadenie': { xp: 42000, items: [['Kalashnikov PKM 7.62x54R machine gun', 1], ['PK 7.62x54R 100-round box', 2], ['7.62x54mm R BT gzh ammo pack (20 pcs)', 10]] },
  'hw-prototipirovanie': { xp: 34000, items: [] },
  'hw-vrag-moego-vraga': { xp: 24000, items: [['BNTI Gzhel-K body armor', 3]] },
  'hw-vrag-moego-vraga-dogovor': { xp: 18000, items: [['RDA-78 vaccine', 1], ['TG-Vi-24 vaccine prototype', 2]] },
  'hw-oslepit-protivnika': { xp: 60000, items: [['Weapon case', 1]] },
  'hw-highrisk-highreward': { xp: 44000, items: [['Propital regenerative stimulant injector', 3], ['Zagustin hemostatic drug injector', 3], ['TG-Vi-24 vaccine prototype', 2]] },
  'hw-pervye-rezultaty': { xp: 42000, items: [['Grizzly medical kit', 5], ['Model 8230 CS gas grenade (RDA-68), when you accept it', 3]] },
  'hw-izuchenie-vraga': { xp: 34000, items: [] },
  'hw-radi-obschey-celi': { xp: 24000, items: [['TerraGroup Labs access keycard', 4], ['Ibuprofen painkillers', 2], ['Augmentin antibiotic pills', 2]] },
  'hw-radi-obschey-celi-dogovor': { xp: 18000, items: [['Infected tissue sample', 2]] },
  'hw-posledniy-ryvok': { xp: 60000, items: [['Item case', 1], ['RDA-78 vaccine', 1], ['TG-Vi-24 vaccine prototype', 2], ['Model 8230 CS gas grenade (RDA-78), when you accept it', 1]] },
}

/** Привести название предмета к сравнимому виду: регистр, ё/е, дефисы-пробелы. */
const normItem = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const compactItem = (s: string) => normItem(s).replace(/\s+/g, '')

/**
 * Проставить опыт и предметы из REWARDS. Предмет ищем по nameEn/name, затем по «сжатому» виду
 * (без пробелов и знаков), затем по первым 24 символам — названия на tarkovquestie чуть отличаются
 * от tarkov.dev («12ga» против «12/70»). Нераспознанное уходит в заметку задания.
 */
function applyRewards(tasks: Task[], data: GameData): void {
  const byName = new Map<string, string>()
  const byPrefix = new Map<string, string>()
  for (const it of Object.values(data.items)) {
    for (const n of [it.nameEn, it.name]) {
      if (!n) continue
      byName.set(normItem(n), it.id)
      byName.set(compactItem(n), it.id)
      byPrefix.set(compactItem(n).slice(0, 24), it.id)
    }
  }
  for (const t of tasks) {
    const r = REWARDS[t.id]
    if (!r) continue
    t.experience = r.xp
    const items: { item: string; count: number }[] = []
    const unknown: string[] = []
    for (const [name, count] of r.items) {
      const id = byName.get(normItem(name)) ?? byName.get(compactItem(name)) ?? byPrefix.get(compactItem(name).slice(0, 24))
      if (id) items.push({ item: id, count })
      else unknown.push(`${count}× ${name}`)
    }
    t.rewardItems = items
    if (unknown.length) t.note = [t.note, `Награда (нет в справочнике): ${unknown.join(', ')}.`].filter(Boolean).join(' ')
  }
}

/** Название ивента без префикса, для сверки с tarkov.dev: «Halloween: Rumors» → «rumors». */
const normName = (s: string) => s.toLowerCase().replace(/^halloween:\s*/, '').replace(/[^\p{L}\p{N}]/gu, '')

export function eventTasks(): Task[] {
  return DEFS.map((d) => {
    const objectives: Objective[] = d.objectives.map((o, i) => ({
      id: `${d.id}-o${i + 1}`,
      type: o.type,
      description: o.d,
      optional: !!o.optional,
      maps: [],
      count: o.count,
      foundInRaid: false,
    }))
    return {
      id: d.id,
      name: d.name,
      nameEn: d.nameEn,
      normalizedName: d.id,
      trader: d.trader,
      map: null,
      minPlayerLevel: 0,
      taskRequirements: (d.after ?? []).map((task) => ({ task, status: ['complete'] })),
      traderRequirements: [],
      objectives,
      kappaRequired: false,
      lightkeeperRequired: false,
      experience: 0,
      factionName: 'Any',
      wikiLink: d.wiki,
      taskImageLink: null,
      neededKeys: [],
      rewardItems: [],
      rewardStanding: [],
      event: EVENT_ID,
      note: [
        d.locations.length ? `Карты: ${d.locations.join(', ')}.` : '',
        d.hint ?? '',
        'Данные собраны вручную: tarkov.dev эти квесты пока не отдаёт.',
      ].filter(Boolean).join(' '),
    }
  })
}

/**
 * Подмешать ивент во все режимы.
 * Не добавляет задание, если tarkov.dev уже отдаёт квест с таким же названием —
 * так раздел сам гаснет, когда ивент появится в официальных данных.
 */
export function mergeEventTasks(data: GameData): GameData {
  if (!eventActive()) return data
  const tasks = { ...data.tasks }
  const known = new Set(Object.values(data.tasks).map((t) => normName(t.nameEn)))
  const added = eventTasks().filter((t) => !tasks[t.id] && !known.has(normName(t.nameEn)))
  applyRewards(added, data)
  for (const t of added) tasks[t.id] = t
  return { ...data, tasks }
}
