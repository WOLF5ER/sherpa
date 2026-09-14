import type { GameData, Task, Objective, ObjectiveType } from './types'
import { ROUBLES } from './types'

/**
 * Сезонная цепочка «KORD BREACH» (сезон 1, 03.08–07.12.2026). В данных tarkov.dev её нет —
 * собрана вручную по tarkov.help (ru) и гайдам. Добавляется только в режим pvp-season.
 * Как только tarkov.dev выложит эти квесты — файл можно удалить.
 *
 * Координаты точек (`at`) — приближённые (±10–30 м): сняты с карт вики (escapefromtarkov.fandom.com,
 * гайды к квестам с обведёнными местами) через привязку к известным координатам выходов tarkov.dev;
 * там, где место совпадает с объектом tarkov.dev (замок, рубильник, зона другого квеста) — взяты его координаты.
 * Картинки (`pics`) — файлы вики, лицензия CC BY-NC-SA.
 */

const T = {
  prapor: '54cb50c76803fa8b248b4571', therapist: '54cb57776803fa99248b456e', fence: '579dc571d53a0658a154fbec',
  mechanic: '5a7c2eca46aef81a7ca2145d', ragman: '5ac3b934156ae10c4430e83c', jaeger: '5c0647fdd443bc2504c2d371',
  lightkeeper: '638f541a29ffd1183d187f57', btr: '656f0f98d80a697f855d34b1',
}
const M = {
  customs: '56f40101d2720b2a4d8b45d6', woods: '5704e3c2d2720bac5b8b4567', lighthouse: '5704e4dad2720bb55b8b4567',
  shoreline: '5704e554d2720bac5b8b456e', reserve: '5704e5fad2720bc05b8b4567', interchange: '5714dbc024597771384a510d',
  streets: '5714dc692459777137212e12', lab: '5b0fc42d86f7744a585f9105', groundZero: '653e6760052c01c1c805532f',
  icebreaker: '69af492a4819ea4ba10a69c5',
}
const I = {
  wifiCam: '5b4391a586f7745321235ab2', tnt: '60391b0fb847c71012789415', key314: '5780cf7f2459777de4559322',
  labsCard: '5c94bbff86f7747ee735c08f', obj11sr: '5e42c81886f7742a01529f57', rsp30y: '624c0b3340357b5f566e8766',
  briefcase: '6a3563dacdaebb512e0a009c', ssd: '6a5f9c49b8281c31a1062aea', encKeys: '6a5f9cfcc409750b6e065592',
  bdLaptop: '6a5f9c25e8c84d8b0602f22a', fenceData: '6a55f339fe4be93a04090acc',
  rigSiege: '68947a4be4bf255d1b0ca746', rigLv119v1: '689479a4a733b1602007e2eb', rigLv119v2: '689479eb30cc5ba7be00f5ff', rigFcpc: '689479cb47e5acd1e10be986',
  packTT: '68947a8ce4bf255d1b0ca759', packMR: '68947ab5a733b1602007e2fe', packNice: '68947ad3e4bf255d1b0ca75c',
  maskM53: '689b880fff8b4adc420f5b56', sotr: '689b404db49f27df1c0873f6', gatorz: '689b3fffa1295e322207a677',
  moonshine: '5d1b376e86f774252519444e', cofdm: '5c052f6886f7746b1e3db148', intel: '5c12613b86f7743bbe2c3f76', topo: '62a0a124de7ac81993580542',
}

interface Def {
  id: string
  name: string
  nameEn: string
  trader: string
  map?: string | null
  after?: string[]
  loyalty?: { trader: string; level: number }
  xp: number
  rub?: number
  objectives: {
    type: ObjectiveType; d: string; maps?: string[]; items?: string[]; count?: number; fir?: boolean; optional?: boolean
    /** точки на карте [map, x, y, z] — координаты приближённые (см. шапку файла) */
    at?: [string, number, number, number][]
    /** файлы с вики (File:…) — карта с отметкой и скрины места */
    pics?: string[]
  }[]
  keys?: string[]
  wiki: string
  note?: string
}

const wiki = (slug: string) => `https://tarkov.help/ru/quest/${slug}`
const SUFFIX = ' [KORD BREACH]'

const DEFS: Def[] = [
  {
    id: 'kb-uninvited-guests-1', name: 'Незваные гости. Часть 1', nameEn: 'Uninvited Guests - Part 1', trader: T.prapor, map: M.shoreline,
    loyalty: { trader: T.prapor, level: 2 }, xp: 6000, rub: 18000, wiki: wiki('nezvanie-gosti-chast-1-kord-breach'),
    objectives: [
      { type: 'findQuestItem', d: 'Найти кейс с военным оборудованием на локации Берег (одна из трёх точек: будка у вышки Сорди, 2-й этаж метеостанции, 2-й этаж ГЭС)', maps: [M.shoreline],
        at: [[M.shoreline, -710, -40, 98], [M.shoreline, -512, -47, 242], [M.shoreline, -231, -45, 194]],
        pics: ['Uninvited_Guests_-_Part_1_Map.png', 'Uninvited_Guests_-_Part_1_Spawn_1.png', 'Uninvited_Guests_-_Part_1_Spawn_2.png', 'Uninvited_Guests_-_Part_1_Spawn_3.png'] },
      { type: 'extract', d: 'Выйти из рейда с кейсом', maps: [M.shoreline] },
    ],
  },
  {
    id: 'kb-uninvited-guests-2', name: 'Незваные гости. Часть 2', nameEn: 'Uninvited Guests - Part 2', trader: T.btr, map: null,
    after: ['kb-uninvited-guests-1'], xp: 5000, wiki: wiki('nezvanie-gosti-chast-2-kord-breach'),
    objectives: [{ type: 'giveQuestItem', d: 'Передать кейс с военным оборудованием водителю БТР (Лес или Улицы Таркова)', maps: [M.woods, M.streets] }],
  },
  {
    id: 'kb-unanswered-calls', name: 'Звонки без ответа', nameEn: 'Unanswered Calls', trader: T.therapist, map: M.groundZero,
    xp: 11000, rub: 180000, wiki: wiki('zvonki-bez-otveta-kord-breach'),
    note: 'Выходить только через «Пункт МЧС» или «Подвал Nakatani»; смерть или другой выход — провал.',
    objectives: [
      { type: 'plantQuestItem', d: 'Заложить послание Терапевта у стойки регистрации на 2-м этаже главного офиса TerraGroup', maps: [M.groundZero],
        at: [[M.groundZero, -25, 29.5, 40]], pics: ['Saving_the_Mole_Map.png', 'Ground_Zero_TerraGroup_Building.png', 'Unanswered_Calls_stash_position.png'] },
      { type: 'extract', d: 'Выйти через «Пункт МЧС» или «Подвал Nakatani»', maps: [M.groundZero] },
    ],
  },
  {
    id: 'kb-cast-the-net', name: 'Забросить невод', nameEn: 'Cast the Net', trader: T.prapor, map: null,
    after: ['kb-uninvited-guests-2'], xp: 11000, rub: 180000, wiki: wiki('zabrosit-nevod-kord-breach'),
    objectives: [
      { type: 'plantItem', d: 'Закрепить Wi-Fi камеру на грузовике «Урал» рядом с ГЭС (Берег)', maps: [M.shoreline], items: [I.wifiCam], count: 1,
        at: [[M.shoreline, -180, -48, 145]], pics: ['Cast_the_Net_Shoreline_Map.png', 'Cast_the_Net_Shoreline_Camera_2.png'] },
      { type: 'plantItem', d: 'Закрепить Wi-Fi камеру на экскаваторе у ручья под базой контрабандистов (Берег)', maps: [M.shoreline], items: [I.wifiCam], count: 1,
        at: [[M.shoreline, -595, -40, -199]], pics: ['Cast_the_Net_Shoreline_Map.png', 'Cast_the_Net_Shoreline_Camera_1.png'] },
      { type: 'plantItem', d: 'Закрепить Wi-Fi камеру на бетономешалке у упавшего крана (Улицы Таркова)', maps: [M.streets], items: [I.wifiCam], count: 1,
        at: [[M.streets, 199, 4, 260]], pics: ['Cast_the_Net_Streets_of_Tarkov_Map.png', 'Cast_the_Net_Streets_of_Tarkov_Camera_1.png'] },
      { type: 'plantItem', d: 'Закрепить Wi-Fi камеру на крыше биотуалетов перед кинотеатром (Улицы Таркова)', maps: [M.streets], items: [I.wifiCam], count: 1,
        at: [[M.streets, -50, 3, 381]], pics: ['Cast_the_Net_Streets_of_Tarkov_Map.png', 'Cast_the_Net_Streets_of_Tarkov_Camera_2.png'] },
      { type: 'plantItem', d: 'Закрепить Wi-Fi камеру в кабине фуры на спуске к проспекту Мира (Эпицентр)', maps: [M.groundZero], items: [I.wifiCam], count: 1,
        at: [[M.groundZero, 122, 17, 63]], pics: ['Cast_the_Net_Ground_Zero_Map.png', 'Cast_the_Net_Ground_Zero_Camera_1.png'] },
      { type: 'plantItem', d: 'Закрепить Wi-Fi камеру внутри жёлтого автобуса на подземном уровне (Эпицентр)', maps: [M.groundZero], items: [I.wifiCam], count: 1,
        at: [[M.groundZero, 73, 14, 115]], pics: ['Cast_the_Net_Ground_Zero_Map.png', 'Cast_the_Net_Ground_Zero_Camera_2.png'] },
    ],
  },
  {
    id: 'kb-know-your-enemy', name: 'Знай своего врага', nameEn: 'Know Your Enemy', trader: T.prapor, map: M.icebreaker,
    after: ['kb-cast-the-net'], xp: 11000, rub: 180000, wiki: wiki('znay-svoego-vraga-kord-breach'),
    objectives: [{ type: 'giveItem', d: 'Передать снаряжение Black Division (чехлы для бронеплит / разгрузки) — 5 шт.', items: [I.rigSiege, I.rigLv119v1, I.rigLv119v2, I.rigFcpc], count: 5, fir: true }],
  },
  {
    id: 'kb-reverse-gear', name: 'Задняя передача', nameEn: 'Reverse Gear', trader: T.prapor, map: null,
    after: ['kb-know-your-enemy'], xp: 11000, rub: 180000, wiki: wiki('zadnyaya-peredacha-kord-breach'),
    objectives: [
      { type: 'findQuestItem', d: 'Снять Wi-Fi камеру с грузовика «Урал» рядом с ГЭС (Берег)', maps: [M.shoreline],
        at: [[M.shoreline, -180, -48, 145]], pics: ['Cast_the_Net_Shoreline_Map.png', 'Cast_the_Net_Shoreline_Camera_2_close.png'] },
      { type: 'findQuestItem', d: 'Снять Wi-Fi камеру с экскаватора на территории контрабандистов (Берег)', maps: [M.shoreline],
        at: [[M.shoreline, -595, -40, -199]], pics: ['Cast_the_Net_Shoreline_Map.png', 'Cast_the_Net_Shoreline_Camera_1_close.png'] },
      { type: 'findQuestItem', d: 'Снять Wi-Fi камеру с бетономешалки у упавшего крана (Улицы Таркова)', maps: [M.streets],
        at: [[M.streets, 199, 4, 260]], pics: ['Cast_the_Net_Streets_of_Tarkov_Map.png', 'Cast_the_Net_SOT_Camera_1_close.png'] },
      { type: 'findQuestItem', d: 'Снять Wi-Fi камеру с крыши биотуалетов у кинотеатра «Родина» (Улицы Таркова)', maps: [M.streets],
        at: [[M.streets, -50, 3, 381]], pics: ['Cast_the_Net_Streets_of_Tarkov_Map.png', 'Cast_the_Net_SOT_Camera_2_close.png'] },
      { type: 'findQuestItem', d: 'Снять Wi-Fi камеру с кабины фуры на спуске к проспекту Мира (Эпицентр)', maps: [M.groundZero],
        at: [[M.groundZero, 122, 17, 63]], pics: ['Cast_the_Net_Ground_Zero_Map.png', 'Reverse_Gear_GZ_Camera_1_close.png'] },
      { type: 'findQuestItem', d: 'Снять Wi-Fi камеру с жёлтого автобуса на подземном уровне (Эпицентр)', maps: [M.groundZero],
        at: [[M.groundZero, 73, 14, 115]], pics: ['Cast_the_Net_Ground_Zero_Map.png', 'Reverse_Gear_GZ_Camera_2_close.png'] },
      { type: 'giveQuestItem', d: 'Передать все шесть камер Прапору' },
    ],
  },
  {
    id: 'kb-key-to-understanding', name: 'Ключ к пониманию', nameEn: 'Key to Understanding', trader: T.fence, map: null,
    after: ['kb-reverse-gear'], xp: 30000, rub: 300000, wiki: wiki('kluch-k-ponimaniyu-kord-breach'),
    note: 'Ключи выпадают с бойцов Black Division на обычных локациях (кроме Ледокола); по отзывам — чаще ночью.',
    objectives: [{ type: 'giveItem', d: 'Найти в рейде и передать ключи шифрования Black Division', items: [I.encKeys], count: 1, fir: true }],
  },
  {
    id: 'kb-riding-the-wave', name: 'На волне популярности', nameEn: 'Riding the Wave', trader: T.ragman, map: M.icebreaker,
    after: ['kb-reverse-gear'], xp: 30000, rub: 300000, wiki: wiki('na-volne-populyarnosti-kord-breach'),
    objectives: [
      { type: 'giveItem', d: 'Передать чехол First Spear «Siege-R Optimized M.A.S.S.» (Black Division)', items: [I.rigSiege], count: 1, fir: true },
      { type: 'giveItem', d: 'Передать чехол Spiritus Systems «LV-119» (Black Division)', items: [I.rigLv119v1, I.rigLv119v2], count: 1, fir: true },
      { type: 'giveItem', d: 'Передать чехол Ferro Concepts «FCPC V5» (Black Division)', items: [I.rigFcpc], count: 1, fir: true },
      { type: 'giveItem', d: 'Передать рюкзак Tasmanian Tiger «Modular Pack 45 Plus» (Black Division)', items: [I.packTT], count: 1, fir: true },
      { type: 'giveItem', d: 'Передать рюкзак Mystery Ranch «2 Day Assault Pack» (Black Division)', items: [I.packMR], count: 1, fir: true },
      { type: 'giveItem', d: 'Передать грузовую раму Mystery Ranch «NICE Frame Load Sling» с кейсом', items: [I.packNice], count: 1, fir: true },
      { type: 'giveItem', d: 'Передать противогаз M53A1', items: [I.maskM53], count: 1, fir: true },
      { type: 'giveItem', d: 'Передать респиратор Gentex Ops-Core «SOTR»', items: [I.sotr], count: 1, fir: true },
      { type: 'giveItem', d: 'Передать очки Gatorz «Specter MILSPEC»', items: [I.gatorz], count: 1, fir: true },
    ],
  },
  {
    id: 'kb-whats-in-the-bag', name: 'Что в сумке?', nameEn: "What's in the Bag?", trader: T.prapor, map: null,
    after: ['kb-key-to-understanding'], xp: 30000, rub: 300000, wiki: wiki('chto-v-sumke-kord-breach'),
    note: 'Портфель: награда за «Заднюю передачу», обмен 5 жетонов Black Division в круге сектантов или редкий дроп с бойцов Black Division.',
    objectives: [{ type: 'giveItem', d: 'Найти и передать портфель с документами', items: [I.briefcase], count: 1 }],
  },
  {
    id: 'kb-forbidden-knowledge', name: 'Запретные знания', nameEn: 'Forbidden Knowledge', trader: T.prapor, map: null,
    after: ['kb-whats-in-the-bag'], xp: 30000, rub: 300000, wiki: wiki('zapretnie-znaniya-kord-breach'),
    objectives: [{ type: 'giveItem', d: 'Найти в рейде и передать SSD диск 14-4 KORD (спавн в зонах Black Division: Улицы, Берег, Лаборатория)', items: [I.ssd], count: 3, fir: true, maps: [M.streets, M.shoreline, M.lab] }],
  },
  {
    id: 'kb-wolf-in-sheeps-clothing', name: 'Волк в овечьей шкуре', nameEn: "Wolf in Sheep's Clothing", trader: T.prapor, map: null,
    after: ['kb-forbidden-knowledge'], xp: 30000, rub: 300000, wiki: wiki('volk-v-ovechiei-shkure-kord-breach'),
    note: 'Убивать нужно в надетом чехле для бронеплит Black Division. Дальше — выбор: «Финишная прямая» (Скупщик) или «Последствия наших решений» (Скупщик); выполнение одного проваливает другой.',
    objectives: [
      { type: 'shoot', d: 'Устранить бойцов Black Division в чехле Black Division на Берегу (6)', maps: [M.shoreline], count: 6 },
      { type: 'shoot', d: 'Устранить бойцов Black Division в чехле Black Division на Улицах Таркова (6)', maps: [M.streets], count: 6 },
      { type: 'shoot', d: 'Устранить бойцов Black Division в чехле Black Division на Эпицентре (6)', maps: [M.groundZero], count: 6 },
    ],
  },
  {
    id: 'kb-final-stretch', name: 'Финишная прямая', nameEn: 'Final Stretch', trader: T.fence, map: M.streets,
    after: ['kb-wolf-in-sheeps-clothing'], xp: 35000, rub: 300000, wiki: wiki('kord-breach-final-stretch'),
    note: 'Выбор: выполнение проваливает «Последствия наших решений».',
    objectives: [{ type: 'findQuestItem', d: 'Найти ноутбук в схроне на заднем дворе кафе «Back to the 90s» и передать Скупщику', maps: [M.streets],
      at: [[M.streets, -96.5, 4, 238.4]], pics: ['Final_Stretch_Map.png', 'Final_Stretch_Diner.png', 'Final_Stretch_Ventilation.png', 'Final_Stretch_Laptop_Spawn.png'] }],
  },
  {
    id: 'kb-consequences', name: 'Последствия наших решений', nameEn: 'Consequences of Our Decisions', trader: T.fence, map: M.streets,
    after: ['kb-wolf-in-sheeps-clothing'], xp: 35000, rub: 300000, wiki: wiki('kord-breach-consequences-of-our-decisions'),
    note: 'Выбор: выполнение проваливает «Финишную прямую». Расшифровка — в Разведцентре схрона.',
    objectives: [
      { type: 'findQuestItem', d: 'Найти ноутбук в схроне на заднем дворе кафе «Back to the 90s» (Улицы Таркова)', maps: [M.streets],
        at: [[M.streets, -96.5, 4, 238.4]], pics: ['Final_Stretch_Map.png', 'Final_Stretch_Diner.png', 'Final_Stretch_Ventilation.png', 'Final_Stretch_Laptop_Spawn.png'] },
      { type: 'useItem', d: 'Расшифровать данные с ноутбука в Разведцентре и передать' },
    ],
  },
  {
    id: 'kb-desperate-assault', name: 'Отчаянный штурм', nameEn: 'Desperate Assault', trader: T.mechanic, map: M.lab,
    after: ['kb-wolf-in-sheeps-clothing'], xp: 30000, rub: 300000, wiki: wiki('kord-breach-desperate-assault'),
    note: 'Открывается после любого из двух квестов выбора.',
    objectives: [{ type: 'shoot', d: 'Устранить 15 бойцов Black Division на локации Лаборатория', maps: [M.lab], count: 15 }],
  },
  {
    id: 'kb-stay-clear', name: 'Капкан', nameEn: 'Stay Clear of Blast Zone', trader: T.jaeger, map: M.shoreline,
    after: ['kb-consequences'], xp: 30000, rub: 300000, wiki: wiki('kord-breach-stay-clear-of-blast-zone'),
    objectives: [
      { type: 'plantItem', d: 'Заложить ТП-200 у первого пролома в заборе у западного крыла санатория', maps: [M.shoreline], items: [I.tnt], count: 1,
        at: [[M.shoreline, -125, -5, -95]], pics: ['Stay_Clear_of_Blast_Zone_Map.png', 'Stay_Clear_of_Blast_Zone_West_Fence.png'] },
      { type: 'plantItem', d: 'Заложить ТП-200 у второго пролома в заборе у западного крыла санатория', maps: [M.shoreline], items: [I.tnt], count: 1,
        at: [[M.shoreline, -118, -5, -44]], pics: ['Stay_Clear_of_Blast_Zone_Map.png', 'Stay_Clear_of_Blast_Zone_North_Fence.png'] },
      { type: 'plantItem', d: 'Заложить ТП-200 у пролома в заборе у восточного крыла санатория', maps: [M.shoreline], items: [I.tnt], count: 1,
        at: [[M.shoreline, -383, -5, -80]], pics: ['Stay_Clear_of_Blast_Zone_Map.png', 'Stay_Clear_of_Blast_Zone_East_Fence.png'] },
    ],
  },
  {
    id: 'kb-break-the-chain', name: 'Разрыв цепи', nameEn: 'Break the Chain', trader: T.mechanic, map: null,
    after: ['kb-desperate-assault'], xp: 30000, rub: 300000, wiki: wiki('kord-breach-break-the-chain'),
    objectives: [
      { type: 'visit', d: 'Уничтожить ретранслятор на трубе котельной у незаконченной стройки (Таможня)', maps: [M.customs],
        at: [[M.customs, 112, 15, -60]], pics: ['Break_the_Chain_Customs_Map.jpg', 'Break_the_Chain_Factory_Chimney_Repeater.png'] },
      { type: 'visit', d: 'Уничтожить ретранслятор на вышке ЛЭП у выхода «ЖД к военной базе» (Таможня)', maps: [M.customs],
        at: [[M.customs, 392, 12, 160]], pics: ['Break_the_Chain_Customs_Map.jpg', 'Break_the_Chain_Power_Line_Repeater.png'] },
      { type: 'visit', d: 'Уничтожить ретранслятор на вершине горы, где сидит снайпер (Лес)', maps: [M.woods],
        at: [[M.woods, -165, 40, -204]], pics: ['Break_the_Chain_Woods_Map.jpg', 'Break_the_Chain_Mountain_Repeater.png'] },
      { type: 'visit', d: 'Уничтожить ретранслятор на вышке сотовой связи у бункера диких (Лес)', maps: [M.woods],
        at: [[M.woods, 220, 35, -740]], pics: ['Break_the_Chain_Woods_Map.jpg', 'Break_the_Chain_Cell_Tower_Repeater.png'] },
    ],
  },
  {
    id: 'kb-digital-puzzle', name: 'Цифровой пазл', nameEn: 'Digital Puzzle', trader: T.mechanic, map: null,
    after: ['kb-break-the-chain'], xp: 35000, rub: 150000, wiki: wiki('kord-breach-digital-puzzle'),
    objectives: [{ type: 'giveItem', d: 'Обработать в схроне и передать данные с защищённого ноутбука Black Division', items: [I.bdLaptop], count: 1 }],
  },
  {
    id: 'kb-price-for-information', name: 'Плата за информацию', nameEn: 'Price for Information', trader: T.lightkeeper, map: null,
    after: ['kb-digital-puzzle'], xp: 0, wiki: wiki('kord-breach-price-for-information'),
    objectives: [
      { type: 'visit', d: 'Перейти на Маяк с Берега', maps: [M.shoreline] },
      { type: 'visit', d: 'Перейти на Резерв с Маяка', maps: [M.lighthouse] },
      { type: 'visit', d: 'Перейти на Лес с Резерва', maps: [M.reserve] },
      { type: 'shoot', d: 'Убить 10 любых целей во время переходов', count: 10 },
      { type: 'extract', d: 'Выжить и выйти из рейда', maps: [M.woods] },
    ],
  },
  {
    id: 'kb-in-the-name-of-humanity', name: 'Во имя человечества...', nameEn: 'In the Name of Humanity...', trader: T.lightkeeper, map: null,
    after: ['kb-price-for-information'], xp: 0, wiki: wiki('kord-breach-in-the-name-of-humanity'),
    keys: [I.obj11sr],
    objectives: [
      { type: 'visit', d: 'Найти рычаг подачи питания на электростанции (Развязка)', maps: [M.interchange], at: [[M.interchange, -201.1, 23.2, -357.8]] },
      { type: 'visit', d: 'Активировать безопасную комнату в туалете Бургер Спота ключ-картой от Объекта #11SR', maps: [M.interchange], items: [I.obj11sr], at: [[M.interchange, -51.9, 22.3, 45.8]] },
      { type: 'visit', d: 'Активировать рычаг контейнера №14 в безопасной комнате и забрать кейс из контейнера на парковке под IDEA', maps: [M.interchange], at: [[M.interchange, -47.7, 22.9, 42.6]] },
      { type: 'shoot', d: 'Убить 3 ЧВК на Развязке ночью (20:00–08:00)', maps: [M.interchange], count: 3 },
      { type: 'visit', d: 'Перейти на Улицы Таркова', maps: [M.interchange] },
      { type: 'shoot', d: 'Убить 3 ЧВК на Улицах ночью (20:00–08:00)', maps: [M.streets], count: 3 },
      { type: 'plantQuestItem', d: 'Заложить кейс на балконе ресторана на 3-м этаже отеля «Пайнвуд»', maps: [M.streets], at: [[M.streets, -77, 16, 150]] },
      { type: 'useItem', d: 'Использовать РСП-30 (жёлтый) у провалившегося трамвая', maps: [M.streets], items: [I.rsp30y], count: 1 },
      { type: 'extract', d: 'Выжить и выйти из рейда', maps: [M.streets] },
    ],
  },
  {
    id: 'kb-historical-prospects', name: 'Исторические перспективы', nameEn: 'Historical Prospects', trader: T.lightkeeper, map: null,
    after: ['kb-in-the-name-of-humanity'], xp: 0, wiki: wiki('kord-breach-historical-prospects'),
    keys: [I.key314],
    objectives: [
      { type: 'shoot', d: 'Убить 3 ЧВК ночью (20:00–08:00) на Таможне и заложить жетоны в меченой комнате общаги (ключ 314)', maps: [M.customs], count: 3,
        at: [[M.customs, 180.7, 6.85, 183.7]], pics: ['TheCultPart2DormsMap.png', 'Marked_Room_Door.png'] },
      { type: 'shoot', d: 'Убить 3 ЧВК на Лесу и заложить жетоны в меченом круге в затопленной деревне', maps: [M.woods], count: 3,
        at: [[M.woods, -88.7, 12.6, -717.6]], pics: ['They_Are_Already_Here_Woods_Activation_Location_Map.png', 'The_second_ritual_spot_in_the_Woods.png'] },
      { type: 'shoot', d: 'Убить 3 ЧВК на Улицах и заложить жетоны в меченом круге в квартире сектантов (Никитская, 8, 2-й этаж)', maps: [M.streets], count: 3,
        at: [[M.streets, -130.8, 9.5, 269.7]], pics: ['Nikitskaya_Street_8_Map.png', 'Nikitskaya_Street_Second_Floor_Cultist_Apartment_Entrance.png', 'Nikitskaya_Street_Second_Floor_Cultist_Apartment_Door.png', 'Nikitskaya_Street_Second_Floor_Cultist_Apartment.png'] },
    ],
  },
]

export function seasonTasks(): Task[] {
  return DEFS.map((d) => {
    const objectives: Objective[] = d.objectives.map((o, i) => ({
      id: `${d.id}-o${i + 1}`,
      type: o.type,
      description: o.d,
      optional: !!o.optional,
      maps: o.maps ?? (d.map ? [d.map] : []),
      count: o.count,
      foundInRaid: o.fir,
      items: o.items,
      zones: o.at?.map(([map, x, y, z], j) => ({ id: `${d.id}-o${i + 1}-z${j + 1}`, map, position: { x, y, z } })),
      approx: !!o.at,
      pics: o.pics,
    }))
    const rewardItems = d.rub ? [{ item: ROUBLES, count: d.rub }] : []
    return {
      id: d.id,
      name: d.name + SUFFIX,
      normalizedName: d.id,
      trader: d.trader,
      map: d.map ?? null,
      minPlayerLevel: 0,
      taskRequirements: (d.after ?? []).map((task) => ({ task, status: ['complete'] })),
      traderRequirements: d.loyalty ? [{ trader: d.loyalty.trader, requirementType: 'level', value: d.loyalty.level }] : [],
      objectives,
      kappaRequired: false,
      lightkeeperRequired: false,
      experience: d.xp,
      factionName: 'Any',
      wikiLink: d.wiki,
      taskImageLink: null,
      neededKeys: d.keys ? [{ keys: d.keys, map: d.map ?? null }] : [],
      rewardItems,
      rewardStanding: [],
      seasonal: true,
      note: d.note,
    }
  })
}

/** Подмешать сезонную цепочку в справочник (только pvp-season). Не трогает квесты, которые tarkov.dev уже отдаёт. */
export function mergeSeasonTasks(data: GameData): GameData {
  const tasks = { ...data.tasks }
  for (const t of seasonTasks()) if (!tasks[t.id]) tasks[t.id] = t
  return { ...data, tasks }
}
