/**
 * Условия выходов — сверено с вики (escapefromtarkov.fandom.com, страницы карт) 13.09.2026.
 * Данные tarkov.dev знают только фракцию, координаты и предмет для передачи (transferItem);
 * ракеты, рычаги, кооп, «без рюкзака» и т.п. — отсюда. Ключ — английское имя выхода из данных.
 *
 * Известные расхождения данных с вики:
 *  - Customs: все 27 выходов ссылаются на один рубильник — артефакт, реальный рычаг только у ZB-013.
 *  - В данных нет: Woods «Friendship Bridge (Co-Op)», Reserve «D-2», Lighthouse «Industrial Zone Gates»,
 *    «Hideout Under the Landing Stage», «Southern Road», «Road to Military Base V-Ex», «Side Tunnel (Co-Op)»,
 *    Shoreline «Railway Bridge», Lab «Medical Block Elevator», Terminal «Zubr Boat», Icebreaker «Helicopter».
 *    Они перечислены здесь с missing: true — попадают в брифинг без координат.
 *  - Легаси-записи без перевода (Rock Passage, CCP Temporary, Gate 2, scav_e6…) — скрываем.
 */

export type ReqKind = 'flare' | 'coop' | 'fee' | 'note' | 'lever' | 'key' | 'nobackpack' | 'noarmor' | 'power' | 'timed' | 'pve' | 'pvp' | 'boat'

export interface ExtractRule {
  /** английское имя выхода (как в данных tarkov.dev) */
  name: string
  kind?: ReqKind[]
  /** короткая подпись на карте */
  tag?: string
  /** полное условие для подсказки и брифинга */
  req?: string
  /** заметка о расположении */
  note?: string
  /** вики говорит другое про фракцию */
  faction?: 'pmc' | 'scav' | 'shared'
  /** не всегда открыт */
  notAlways?: boolean
  /** одноразовый */
  single?: boolean
  /** в данных карты нет — только в списке */
  missing?: boolean
  /** нормализованные имена предметов, которые нужны с собой */
  items?: string[]
}

const FLARE = 'Зелёная ракета: РСП-30 (зелёный) или 26x75 (зелёный) из ракетницы. В группе достаточно одной.'
const FLARE_ITEMS = ['rsp-30-reactive-signal-cartridge-green', '26x75mm-flare-cartridge-green']
const CLIMB = 'Ледоруб Red Rebel + паракорд, без бронежилета'
const CLIMB_ITEMS = ['red-rebel-ice-pick', 'paracord']
const VEX = 'Платный: деньги за место (сумма зависит от кармы дикого), макс. 4–5 игроков, одноразовый'

export const EXTRACT_RULES: Record<string, ExtractRule[]> = {
  customs: [
    { name: 'Boiler Room Basement (Co-op)', kind: ['coop'], tag: 'дикий + ЧВК', req: 'Совместный: нужны дикий и ЧВК вместе', note: 'Подвал котельной с двумя трубами на стройке' },
    { name: 'Dorms V-Ex', kind: ['fee'], tag: '20 000 ₽', req: VEX, single: true, notAlways: true },
    { name: 'Old Gas Station', kind: ['flare'], tag: 'ракета', req: 'Открывается зелёной ракетой', note: 'В подвале', notAlways: true, items: FLARE_ITEMS },
    { name: 'Railroad Passage (Flare)', kind: ['flare'], tag: 'ракета', req: FLARE, note: 'Держись рельсов — иначе снайпер', items: FLARE_ITEMS },
    { name: 'RUAF Roadblock', kind: ['pve'], tag: 'только PvE', req: 'Работает только в PvE' },
    { name: "Smugglers' Boat", kind: ['note'], tag: 'записка «Ворон»', req: 'Записка с кодовым словом «Ворон»', faction: 'shared', items: ['note-with-code-word-voron'] },
    { name: "Smugglers' Bunker (ZB-1012)", kind: ['note'], tag: 'записка «Ворон»', req: 'Записка с кодовым словом «Ворон»', faction: 'shared', items: ['note-with-code-word-voron'] },
    { name: 'ZB-013', kind: ['lever'], tag: 'рычаг', req: 'Активировать рычаг в Складе 4 у крановой площадки', note: 'В подвале базы диких' },
    { name: 'Trailer Park', note: 'В деревьях' },
  ],
  woods: [
    { name: 'Bridge V-Ex', kind: ['fee'], tag: '20 000 ₽', req: VEX, single: true, notAlways: true, note: 'За машиной — пограничные снайперы' },
    { name: 'Friendship Bridge (Co-Op)', kind: ['coop'], tag: 'дикий + ЧВК', req: 'Совместный: нужны дикий и ЧВК вместе', faction: 'shared', missing: true, note: 'С правой стороны моста' },
    { name: 'Northern UN Roadblock', note: 'За воротами — пограничные снайперы' },
    { name: 'Power Line Passage (Flare)', kind: ['flare'], tag: 'ракета', req: FLARE, items: FLARE_ITEMS },
    { name: 'Railway Bridge to Tarkov', kind: ['note'], tag: 'карта минных полей', req: 'Карта минных полей (Лес)', faction: 'shared', items: ['minefield-map-woods'] },
    { name: 'RUAF Gate', kind: ['flare'], tag: 'ракета', req: 'Открывается зелёной ракетой', notAlways: true, items: FLARE_ITEMS },
    { name: 'UN Roadblock', note: 'За контейнерами — пограничные снайперы' },
    { name: 'ZB-014', kind: ['flare'], tag: 'ракета', req: 'Открывается зелёной ракетой', notAlways: true, items: FLARE_ITEMS },
    { name: 'ZB-016', kind: ['flare'], tag: 'ракета', req: 'Открывается зелёной ракетой', notAlways: true, items: FLARE_ITEMS },
  ],
  shoreline: [
    { name: "Climber's Trail", kind: ['noarmor'], tag: 'ледоруб', req: CLIMB, items: CLIMB_ITEMS },
    { name: 'Cliff Descent', kind: ['noarmor'], tag: 'ледоруб', req: CLIMB + ' (в вики этот выход не значится — возможно, старое имя «Тропы альпиниста»)', items: CLIMB_ITEMS },
    { name: 'Mountain Bunker', kind: ['note'], tag: 'записка «Пульс»', req: 'Записка с кодовым словом «Пульс»', faction: 'shared', items: ['note-with-code-word-heartbeat'] },
    { name: 'Pier Boat', kind: ['flare'], tag: 'ракета', req: 'Открывается зелёной ракетой', notAlways: true, items: FLARE_ITEMS },
    { name: 'Railway Bridge', faction: 'pmc', missing: true },
    { name: 'Road to North V-Ex', kind: ['fee'], tag: '20 000 ₽', req: VEX, single: true, note: 'За машиной — пограничные снайперы' },
    { name: "Smugglers' Path (Co-op)", kind: ['coop'], tag: 'дикий + ЧВК', req: 'Совместный: нужны дикий и ЧВК вместе' },
  ],
  interchange: [
    { name: 'Path to River (Flare)', kind: ['flare'], tag: 'ракета', req: FLARE, items: FLARE_ITEMS },
    { name: 'Power Station V-Ex', kind: ['fee'], tag: '20 000 ₽', req: VEX, single: true, notAlways: true },
    { name: 'Saferoom Exfil', kind: ['power', 'key'], tag: 'питание + ключ-карта', single: true,
      req: '1) включить питание на ТЭЦ, 2) смыть писсуар в Burger Spot, 3) приложить ключ-карту Объект #11SR к появившейся панели, 4) запереть дверь изнутри кнопкой', items: ['object-11sr-keycard'] },
    { name: 'Scav Camp (Co-Op)', kind: ['coop'], tag: 'дикий + ЧВК', req: 'Совместный: нужны дикий и ЧВК вместе' },
    { name: "Smugglers' Tunnel", kind: ['note'], tag: 'план коммуникаций', req: 'План подземных коммуникаций развязки', faction: 'shared', items: ['interchange-underground-utility-plan'] },
  ],
  reserve: [
    { name: 'Armored Train', kind: ['timed'], tag: 'по расписанию', req: 'Приходит за 16–12 минут до конца рейда, стоит 7 минут. Два гудка — прибыл, один — минута до отправления', single: true, notAlways: true },
    { name: 'Bunker Hermetic Door', kind: ['lever'], tag: 'рычаг', req: 'Активировать рычаг в будке западнее казармы «белая пешка». Открыт 4 минуты, воет сирена, могут прийти рейдеры' },
    { name: 'Cliff Descent', kind: ['noarmor'], tag: 'ледоруб', req: CLIMB, items: CLIMB_ITEMS },
    { name: 'D-2', kind: ['power'], tag: 'питание', req: '1) включить питание рычагом в командной части подземного бункера, 2) нажать кнопку у раздвижной двери. Могут заспавниться рейдеры', faction: 'pmc', missing: true },
    { name: 'Exit to Woods', kind: ['note'], tag: 'карта минных полей', req: 'Карта минных полей (Резерв)', faction: 'shared', items: ['minefield-map-reserve'] },
    { name: 'Scav Lands (Co-Op)', kind: ['coop'], tag: 'дикий + ЧВК', req: 'Совместный: нужны дикий и ЧВК вместе' },
    { name: 'Sewer Manhole', kind: ['nobackpack'], tag: 'без рюкзака', req: 'Без рюкзака' },
  ],
  lighthouse: [
    { name: 'Armored Train', kind: ['timed'], tag: 'по расписанию', req: 'Приходит за 20–15 минут до конца рейда, стоит 7 минут. Два гудка — прибыл, один — минута до отправления', notAlways: true },
    { name: 'Mountain Pass', kind: ['noarmor'], tag: 'ледоруб', req: CLIMB, items: CLIMB_ITEMS },
    { name: 'Passage by the Lake', kind: ['note'], tag: 'карта минных полей', req: 'Карта минных полей (Маяк)', faction: 'shared', items: ['minefield-map-lighthouse'] },
    { name: 'Road to Military Base V-Ex', kind: ['fee'], tag: '20 000 ₽', req: VEX, faction: 'pmc', single: true, notAlways: true, missing: true },
    { name: 'Side Tunnel (Co-Op)', kind: ['coop'], tag: 'дикий + ЧВК', req: 'Совместный: нужны дикий и ЧВК вместе', faction: 'shared', missing: true, note: 'Зона выхода — в комнате слева после входа в тоннель' },
    { name: 'Industrial Zone Gates', faction: 'scav', missing: true },
    { name: 'Hideout Under the Landing Stage', faction: 'scav', missing: true },
    { name: 'Southern Road', faction: 'pmc', missing: true },
  ],
  'streets-of-tarkov': [
    { name: 'Courtyard', kind: ['flare'], tag: 'ракета', req: 'Открывается зелёной ракетой', notAlways: true, items: FLARE_ITEMS },
    { name: 'Klimov Street (Flare)', kind: ['flare'], tag: 'ракета', req: FLARE, items: FLARE_ITEMS },
    { name: 'Klimov Shopping Mall Exfil', note: '1-й этаж восточной лестницы ТЦ на Климова' },
    { name: 'Near Kamchatskaya Arch', note: 'Во дворе здания музея' },
    { name: 'Pinewood Basement (Co-Op)', kind: ['coop'], tag: 'дикий + ЧВК', req: 'Совместный: нужны дикий и ЧВК вместе', note: 'Северо-восточная лестница отеля Pinewood' },
    { name: 'Primorsky Ave Taxi V-Ex', kind: ['fee'], tag: '20 000 ₽', req: VEX, single: true, notAlways: true },
    { name: "Smugglers' Basement", kind: ['note'], tag: 'записка «Оникс»', req: 'Записка с кодовым словом «Оникс»', faction: 'shared', items: ['note-with-code-word-onyx'] },
    { name: 'Stylobate Building Elevator', note: 'За баром на 3-м этаже ресторана «Белуга»' },
  ],
  'ground-zero': [
    { name: 'Mira Ave (Flare)', kind: ['flare'], tag: 'ракета', req: FLARE + ' Одна ракета каждый рейд лежит у тела дикого, прислонённого к жёлтому автобусу.', items: FLARE_ITEMS },
    { name: 'Nakatani Basement Stairs', note: 'В подвале здания Nakatani' },
    { name: 'Police Cordon V-Ex', kind: ['fee'], tag: '20 000 ₽', req: VEX, single: true },
    { name: 'Scav Checkpoint (Co-op)', kind: ['coop'], tag: 'дикий + ЧВК', req: 'Совместный: нужны дикий и ЧВК вместе' },
    { name: 'Pinewood Basement (Co-Op)', kind: ['coop'], tag: 'дикий + ЧВК', req: 'Совместный: нужны дикий и ЧВК вместе' },
    { name: 'Tartowers Sales Office', kind: ['note'], tag: 'записка «Адаптация»', req: 'Записка с кодовым словом «Адаптация»', faction: 'shared', items: ['note-with-code-word-adaptation'] },
  ],
  factory: [
    { name: 'Cellars', kind: ['key'], tag: 'ключ', req: 'Ключ от выхода с Завода', items: ['factory-emergency-exit-key'] },
    { name: 'Med Tent Gate', kind: ['key'], tag: 'ключ', req: 'Ключ от выхода с Завода', items: ['factory-emergency-exit-key'] },
    { name: 'Courtyard Gate', note: 'Доступен и с раздевалки на 2-м этаже' },
    { name: "Smugglers' Passage", kind: ['note'], tag: 'записка «Ковчег»', req: 'Записка с кодовым словом «Ковчег»', faction: 'shared', items: ['note-with-code-word-ark'] },
  ],
  'the-lab': [
    { name: 'Cargo Elevator', kind: ['power'], tag: 'питание', req: 'Включить питание в подвале, комната G1', note: '2-й этаж, напротив G21. Объявление: Sector G', single: true },
    { name: 'Hangar Gate', kind: ['lever'], tag: 'рычаг', req: 'Открыть ворота из кабины B24 на 2-м этаже ангара', note: 'Sector B11', notAlways: true },
    { name: 'Main Elevator', kind: ['power'], tag: 'питание', req: 'Включить питание в подвале, напротив R4', note: 'Подвал, коридор между R6 и R8' },
    { name: 'Medical Block Elevator', kind: ['power'], tag: 'питание', req: 'Включить питание в подвале, комната G6', note: 'Подвал, между G3 и G4', faction: 'shared', missing: true },
    { name: 'Parking Gate', kind: ['lever'], tag: 'рычаг', req: 'Открыть ворота из комнаты Y21 на 2-м этаже, рядом с R22', note: 'Sector Y11', notAlways: true },
    { name: 'Sewage Conduit', kind: ['lever'], tag: 'слить воду', req: 'Слить воду (рычаг слева в комнате B1, ~80 секунд)', note: 'Подвал, комната B1' },
    { name: 'Ventilation Shaft', kind: ['nobackpack'], tag: 'без рюкзака', req: 'Без рюкзака', note: 'Подвал, коридор между G1 и G8, рядом с G7' },
  ],
  terminal: [
    { name: 'Zubr Boat', kind: ['boat'], tag: 'лодка', req: 'Мест в лодке 3–5 в зависимости от числа игроков в рейде. Взявшие контейнер «Альфа-1» с уликами TerraGroup должны иметь его при себе. По прибытии на пирс — таймер 3 минуты', faction: 'pmc', missing: true, single: true },
  ],
  icebreaker: [
    { name: 'Helicopter', kind: ['flare'], tag: 'ракета', req: 'Зелёная ракета в зоне вызова — вертолёт прилетает через некоторое время. Платный, за место', faction: 'pmc', missing: true, items: FLARE_ITEMS },
  ],
}

// Ночной Завод и Эпицентр 21+ используют те же выходы
EXTRACT_RULES['night-factory'] = EXTRACT_RULES.factory
EXTRACT_RULES['ground-zero-21'] = EXTRACT_RULES['ground-zero']

/** Транзиты открываются через минуту после начала рейда — везде. */
export const TRANSIT_NOTE = 'Открывается через 1 мин после начала рейда'

export function ruleFor(mapNormalized: string, nameEn: string): ExtractRule | undefined {
  return EXTRACT_RULES[mapNormalized]?.find((r) => r.name === nameEn)
}

/** Легаси-запись: ни русского, ни английского перевода — технический ключ вроде «scav_e6» или отключённый выход. */
export function isLegacyExtract(e: { name: string; nameEn: string | null }): boolean {
  return !/[а-яё]/i.test(e.name) && !e.nameEn
}

/** Имя для показа: русское, а если его нет — английское. */
export function extractLabel(e: { name: string; nameEn: string | null }): string {
  return /[а-яё]/i.test(e.name) ? e.name : (e.nameEn ?? e.name)
}
