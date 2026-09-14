/**
 * Справочник навыков: что даёт каждый и как его качать — легально, действиями в игре.
 * Собрано по страницам навыков на escapefromtarkov.fandom.com (CC BY-NC-SA), сверено 14.09.2026.
 * Идентификаторы — внутренние имена навыков (ими же tarkov.dev помечает требования схрона и пунктов квестов).
 * В открытых данных уровней навыков нет — свой уровень вводится вручную в разделе «Навыки».
 */

export type SkillGroup = 'physical' | 'combat' | 'practical' | 'mental'

export interface SkillDef {
  id: string
  /** имя как в русском клиенте */
  name: string
  nameEn: string
  group: SkillGroup
  /** файл иконки на вики (File:…) */
  icon: string
  /** страница на вики */
  wiki: string
  desc: string
  /** эффекты: прибавка за уровень → итог на элитном (51) */
  effects: string[]
  /** бонусы элитного уровня */
  elite: string[]
  /** чем качается */
  howTo: string[]
  tips?: string[]
  /** оговорки: не реализован, эффекты-заглушки */
  note?: string
  /** квесты, награждающие уровнями навыка (английские имена, как у tarkov.dev) */
  rewardQuests?: string[]
}

export const SKILL_GROUPS: { id: SkillGroup; label: string; hint: string }[] = [
  { id: 'physical', label: 'Физические', hint: 'Установка фильтрации воздуха: +40 % к скорости прокачки (только с вставленным фильтром FP-100). Дефектная стена ур. 2–5: −3 % за уровень (−12 %), полностью снимается на 6-м.' },
  { id: 'combat', label: 'Боевые', hint: 'Тир ур. 3: +10 %. Зал славы: бонус растёт от количества и уровня жетонов чужой фракции с твоих убийств.' },
  { id: 'practical', label: 'Практические', hint: 'Библиотека: +30 % к скорости прокачки.' },
  { id: 'mental', label: 'Ментальные', hint: 'Отдельного ускорителя в схроне нет; 20 % очков Внимательности и Восприятия и 10 % Интеллекта капают в Харизму.' },
]

/** Общие правила прокачки (с вики, «Character skills → Leveling»). */
export const SKILL_RULES: string[] = [
  'Максимум — 51 (элитный). Стимуляторы и еда могут временно поднять выше, но не выше 60.',
  'До 1-го уровня нужно 10 очков, дальше +10 за уровень, потолок — 100 очков за уровень.',
  'Скорость в рейде: до первого очка навыка — 129 % (синяя стрелка), после первого — 100 %, после второго — 0,6^(очков − 1) (красная стрелка). Через 200 секунд без очков модификатор сбрасывается, но уже к 100 %, а не к 129 %.',
  'Некоторые квесты дают уровни навыка наградой — их выгодно сдавать, когда навык уже ≥ 9, чтобы получить максимум очков.',
]

const W = 'https://escapefromtarkov.fandom.com/wiki/'

const GUN_EFFECTS = [
  'Скорость перезарядки +0,4 % за уровень → +20 %',
  'Скорость смены оружия +0,8 % за уровень → +40 %',
  'Отдача −0,3 % за уровень → −15 %',
  'Эргономика +0,2 % за уровень → +10 %',
]
const GUN_ELITE = ['Ровное прицеливание первые 3 секунды при любой выносливости', 'Удвоенный прирост мастерства оружия']
const gunHowTo = (what: string) => [
  `Попадания по противникам из ${what}`,
  `Перезарядка ${what}`,
  `Передёргивание затвора / разряжание патронника ${what}`,
]

export const SKILLS: SkillDef[] = [
  // ── Физические ──
  {
    id: 'Endurance', name: 'Выносливость', nameEn: 'Endurance', group: 'physical', icon: 'skill_physical_endurance.png', wiki: W + 'Endurance',
    desc: 'Запас выносливости и скорость её расхода при беге и прыжках, задержка и восстановление дыхания.',
    effects: ['Выносливость +1 % за уровень → +50 %', 'Расход выносливости на прыжок −0,6 % → −30 %', 'Задержка дыхания +2 % → +100 %', 'Восстановление дыхания −1 % → −50 %'],
    elite: ['Выносливость ещё +20 % (итого +70 %)', 'Больше выносливости рук', 'Дыхание не зависит от энергии'],
    howTo: ['Бег без перегруза (вес не жёлтый и не красный)', 'Ходьба без перегруза', 'QTE в спортзале схрона'],
    tips: ['Стимулятор на грузоподъёмность или силу в начале рейда снимает перегруз — и качается выносливость, а не сила.'],
    rewardQuests: ['A Life Lesson'],
  },
  {
    id: 'Health', name: 'Здоровье', nameEn: 'Health', group: 'physical', icon: 'skill_physical_health.png', wiki: W + 'Health',
    desc: 'Быстрее восстановление после рейда, меньше переломов, медленнее расход энергии и воды.',
    effects: ['Шанс перелома −1,2 % за уровень → −60 %', 'Расход энергии −0,6 % → −30 %', 'Обезвоживание −0,6 % → −30 %'],
    elite: ['Поглощение урона (эффект не подтверждён — снижения урона не замечено)'],
    howTo: ['Сам не качается: 25 % всех очков Выносливости, Силы и Жизнеспособности идут сюда'],
    rewardQuests: ['Get a Foothold'],
  },
  {
    id: 'Immunity', name: 'Иммунитет', nameEn: 'Immunity', group: 'physical', icon: 'skill_physical_immunity.png', wiki: W + 'Immunity',
    desc: 'Устойчивость к отрицательным эффектам стимуляторов, еды и ядов.',
    effects: ['Негативные эффекты стимуляторов, еды и воды −1 % за уровень → −50 %', 'Сила отравления −1 % → −50 %', 'Время действия обезболивающих +0,6 % → +30 %'],
    elite: ['90 % шанс полного иммунитета к негативным эффектам стимуляторов, еды и воды', '90 % шанс иммунитета к ядам'],
    howTo: [
      'Пережить отрицательные эффекты стимуляторов и еды: очки начисляются в конце дебаффа, ~0,0045 за секунду его длительности',
      'Важна только длительность, не количество эффектов. Выход из рейда обрывает дебафф — очки только за прошедшее время',
    ],
    tips: [
      'Энергетик Max Energy даёт 5-минутный дебафф стрессоустойчивости — пить раз в 5 минут дёшево и полезно.',
      '2A2-(b-TG) — 15 минут дебаффа на воду, бери запас питья; Obdolbos 2 — 30 минут, в том числе на ХП, бери аптечки.',
      'Метаболизм укорачивает дебаффы — длинные стимуляторы дают меньше очков, но переживаются безопаснее.',
    ],
    rewardQuests: ['Crisis', 'The Huntsman Path - Relentless', 'Get a Foothold'],
  },
  {
    id: 'Metabolism', name: 'Метаболизм', nameEn: 'Metabolism', group: 'physical', icon: 'skill_physical_metabolism.png', wiki: W + 'Metabolism',
    desc: 'Сильнее и дольше эффект еды и питья, физические навыки держатся дольше.',
    effects: ['Положительные эффекты еды и воды +1 % за уровень → +50 %', 'Длительность негативных эффектов стимуляторов, еды и воды −1 % → −50 %'],
    elite: ['Нет урона от истощения и обезвоживания (регенерация выносливости всё равно зависит от энергии и воды)'],
    howTo: [
      'Восполнять энергию и воду едой и питьём в рейде: очки дают за восстановленные единицы, а не за факт еды',
      'В схроне очки не идут (там ошибочная анимация прироста) — ешь в начале каждого рейда',
    ],
    tips: [
      'Обезболивающие с расходом энергии/воды (Ибупрофен, Золотая звезда — много применений) весь рейд, перед выходом — поесть и попить. При Медблоке 3 ибупрофен крафтится в Пропитал и продаётся — процесс бесплатный.',
      'Нет места под еду — съешь ради очков. Сначала еда (она сушит), потом вода.',
    ],
    rewardQuests: ['The Survivalist Path - Junkie', 'A Life Lesson'],
  },
  {
    id: 'Strength', name: 'Сила', nameEn: 'Strength', group: 'physical', icon: 'skill_physical_strength.png', wiki: W + 'Strength',
    desc: 'Выше прыжок, быстрее бег, сильнее удар, дальше бросок, больше вес.',
    effects: ['Высота прыжка +0,4 % за уровень → +20 %', 'Переносимый вес +0,6 % → +30 % (100 кг на элите)', 'Сила удара холодным оружием +0,6 % → +30 %', 'Скорость ходьбы и бега +0,4 % → +20 %', 'Дальность броска +0,4 % → +20 %', 'Расход выносливости при прицеливании −0,4 % → −20 %'],
    elite: ['Оружие на ремне и за спиной не весит', '50 % шанс критического удара холодным оружием'],
    howTo: [
      'Метательное оружие (не больше 3 очков за рейд)',
      'Холодное оружие (не больше 3 очков за рейд)',
      'Ходьба и бег с перегрузом (жёлтый вес): 129 % до первого очка, 100 % после, дальше 0,6^(очков − 1)',
      'QTE в спортзале схрона',
    ],
    tips: [
      'Обычный набор снаряжения уже даёт перегруз на ~22–25 кг: броня 7–13 кг, оружие 4–8 кг — добей магазинами и патронами (пачка дроби 20 шт. = 1 кг).',
      'Дешёвые гранаты (дымы M18, Заря, РДГ-2Б) ускоряют — но за деньги.',
      'Опыт считается по пройденной дистанции при остановке: смерть на бегу теряет последний отрезок. SJ6 (выносливость) и стимуляторы силы увеличивают дистанцию.',
    ],
    rewardQuests: ['A Life Lesson'],
  },
  {
    id: 'StressResistance', name: 'Стрессоустойчивость', nameEn: 'Stress Resistance', group: 'physical', icon: 'skill_mental_stressresistance.png', wiki: W + 'Stress_Resistance',
    desc: 'Меньше болевого шока, тряски рук и тремора.',
    effects: ['Шанс болевого шока −1 % за уровень → −50 %', 'Тремор −1,2 % → −60 %'],
    elite: ['Режим «Берсерк»'],
    howTo: ['0,033 очка/с при низком здоровье', '0,33 очка за каждый эффект «Боль»'],
    tips: ['Граната в ящик с открытым верхом рядом с собой: контузия и боль без смертельного урона.'],
    rewardQuests: ['Psycho Sniper', 'The Survivalist Path - Cold Blooded', 'The Survivalist Path - Wounded Beast', 'Profitable Venture', 'Get a Foothold', 'Bullshit'],
  },
  {
    id: 'Vitality', name: 'Жизнеспособность', nameEn: 'Vitality', group: 'physical', icon: 'skill_physical_vitality.png', wiki: W + 'Vitality',
    desc: 'Меньше кровотечений и мгновенной смерти от разрушения конечности.',
    effects: ['Шанс кровотечения −1,2 % за уровень → −60 %', 'Шанс смерти от потери конечности −0,5 % → −20 %'],
    elite: ['Регенерация здоровья в бою', 'Все кровотечения останавливаются сами: лёгкое через 20 с, тяжёлое через 30 с'],
    howTo: ['0,01 очка за каждые 5 единиц полученного урона (в том числе своего)', '0,3 очка за каждое кровотечение'],
    tips: ['Тяжёлое кровотечение + Пропитал (лечит, не останавливая кровь) — постоянный урон. Свои гранаты тоже считаются; с фильтрацией воздуха выгоднее.'],
    rewardQuests: ['Crisis', 'Get a Foothold'],
  },

  // ── Боевые ──
  {
    id: 'AimDrills', name: 'Прицеливание', nameEn: 'Aim Drills', group: 'combat', icon: 'Skill_combat_weapondrawing.png', wiki: W + 'Aim_Drills',
    desc: 'Быстрее и тише прицеливание.',
    effects: ['Скорость прицеливания +1 % за уровень → +50 %', 'Звук прицеливания −1 % → −50 %'],
    elite: ['Руки не дрожат первые 2 секунды после прицеливания при любой выносливости', 'Меньше дрожь при треморе и переломе первые 2 секунды после прицеливания'],
    howTo: ['0,2 очка за любое попадание по противнику через прицел (ADS)'],
    rewardQuests: ['Intimidator', 'Profitable Venture', 'Consolation Prize'],
  },
  {
    id: 'AssaultRifle', name: 'Штурмовые винтовки и автоматы', nameEn: 'Assault Rifles', group: 'combat', icon: 'skill_combat_assaultrifles.png', wiki: W + 'Assault_Rifles',
    desc: 'Обращение со штурмовыми винтовками и автоматами (в том числе карабинами): отдача, перезарядка, эргономика.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: gunHowTo('штурмовых винтовок и автоматических карабинов'),
    tips: ['У оружия с дозарядкой сверху каждый патрон — отдельная перезарядка: СКС без патрона в патроннике качает очень быстро (патрон при этом выбрасывается на землю — бери дешёвые или подбирай).'],
    rewardQuests: ['Intimidator', 'The Cleaner', 'Consolation Prize'],
  },
  {
    id: 'Sniper', name: 'Снайперские винтовки', nameEn: 'Bolt-action Rifles', group: 'combat', icon: 'skill_combat_sniperrifles.png', wiki: W + 'Bolt-action_Rifles',
    desc: 'Обращение с болтовыми винтовками.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: gunHowTo('болтовых винтовок'),
    rewardQuests: ['Shooter Born in Heaven', 'Psycho Sniper'],
  },
  {
    id: 'DMR', name: 'Марксманские винтовки', nameEn: 'DMRs', group: 'combat', icon: 'skill_combat_dmrs.png', wiki: W + 'DMRs',
    desc: 'Обращение с марксманскими винтовками.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: gunHowTo('марксманских винтовок'),
    rewardQuests: ['The Cleaner', 'Consolation Prize'],
  },
  {
    id: 'HMG', name: 'Тяжёлые пулемёты', nameEn: 'Heavy Machine Guns', group: 'combat', icon: 'skill_combat_hmgs.png', wiki: W + 'Heavy_Machine_Guns',
    desc: 'Обращение с тяжёлыми пулемётами.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: ['Действиями не качается — только наградой за квест'],
    note: 'Навык толком не реализован.',
    rewardQuests: ['Consolation Prize'],
  },
  {
    id: 'LMG', name: 'Лёгкие пулемёты', nameEn: 'Light Machine Guns', group: 'combat', icon: 'skill_combat_lmgs.png', wiki: W + 'Light_Machine_Guns',
    desc: 'Обращение с ручными пулемётами.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: [...gunHowTo('ручных пулемётов'), 'Попадания из стационарных пулемётов'],
    rewardQuests: ['Consolation Prize'],
  },
  {
    id: 'Melee', name: 'Холодное оружие', nameEn: 'Melee', group: 'combat', icon: 'skill_combat_melee.png', wiki: W + 'Melee',
    desc: 'Обращение с холодным оружием.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: ['Попадания по противникам холодным оружием'],
    note: 'Эффекты — заглушки, сейчас ни на что не влияют.',
    rewardQuests: ['Escort', 'Consolation Prize'],
  },
  {
    id: 'Pistol', name: 'Пистолеты', nameEn: 'Pistols', group: 'combat', icon: 'skill_combat_pistols.png', wiki: W + 'Pistols',
    desc: 'Обращение с пистолетами.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: gunHowTo('пистолетов'),
    rewardQuests: ['Escort', 'Consolation Prize', 'Special Equipment'],
  },
  {
    id: 'Revolver', name: 'Револьверы', nameEn: 'Revolvers', group: 'combat', icon: 'skill_combat_revolvers.png', wiki: W + 'Revolvers',
    desc: 'Обращение с револьверами.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: ['Попадания по противникам из револьверов и револьверного ружья МЦ-255-12', 'Перезарядка револьверов'],
    rewardQuests: ['Consolation Prize', 'Special Equipment'],
  },
  {
    id: 'Launcher', name: 'Гранатомёты', nameEn: 'Grenade Launchers', group: 'combat', icon: 'skill_combat_launchers.png', wiki: W + 'Grenade_Launchers',
    desc: 'Обращение с гранатомётами.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: ['Попадания по противникам из подствольных гранатомётов'],
    rewardQuests: ['Consolation Prize'],
  },
  {
    id: 'Shotgun', name: 'Дробовики', nameEn: 'Shotguns', group: 'combat', icon: 'skill_combat_shotguns.png', wiki: W + 'Shotguns',
    desc: 'Обращение с дробовиками.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: gunHowTo('дробовиков'),
    rewardQuests: ['Night Sweep', 'Consolation Prize'],
  },
  {
    id: 'SMG', name: 'Пистолеты-пулемёты', nameEn: 'Submachine Guns', group: 'combat', icon: 'skill_combat_smgs.png', wiki: W + 'Submachine_Guns',
    desc: 'Обращение с пистолетами-пулемётами.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: gunHowTo('пистолетов-пулемётов'),
    rewardQuests: ['The Cleaner', 'Consolation Prize'],
  },
  {
    id: 'Throwing', name: 'Метательное оружие', nameEn: 'Throwables', group: 'combat', icon: 'skill_combat_grenades.png', wiki: W + 'Throwables',
    desc: 'Дальше бросок, меньше расход энергии на бросок.',
    effects: ['Сила броска +0,5 % за уровень → +25 %', 'Энергия на бросок −1 % → −50 %', 'Быстрее бросок'],
    elite: ['Броски не тратят энергию, усталость не влияет на точность'],
    howTo: ['Броски гранат и другого метательного'],
    rewardQuests: ['Consolation Prize', 'The Huntsman Path - Control'],
  },
  {
    id: 'TroubleShooting', name: 'Устранение неполадок', nameEn: 'Troubleshooting', group: 'combat', icon: 'Skill_combat_troubleshooting.png', wiki: W + 'Troubleshooting',
    desc: 'Быстрее устранение задержек оружия.',
    effects: ['Скорость устранения неполадок +0,5 % за уровень → +25 %'],
    elite: ['Тип неполадки виден без осмотра оружия', 'После устранения — шанс той же неполадки от магазина, износа или патрона ниже на 50 %'],
    howTo: ['Устранять задержки оружия (перекос, осечка, недоход затвора)'],
    rewardQuests: ['Safety Guarantee', 'Never Too Late To Learn', 'Consolation Prize'],
  },
  {
    id: 'AttachedLauncher', name: 'Подствольное оружие', nameEn: 'Underbarrel Launchers', group: 'combat', icon: 'skill_combat_ugls.png', wiki: W + 'Underbarrel_Launchers',
    desc: 'Обращение с подствольными гранатомётами.',
    effects: GUN_EFFECTS, elite: GUN_ELITE,
    howTo: ['Действиями не качается — только наградой за квест'],
    note: 'Навык толком не реализован.',
    rewardQuests: ['Consolation Prize'],
  },

  // ── Практические ──
  {
    id: 'CovertMovement', name: 'Скрытное передвижение', nameEn: 'Covert Movement', group: 'practical', icon: 'skill_practical_covertmovement.png', wiki: W + 'Covert_Movement',
    desc: 'Тише шаги и меньше радиус звука при медленном движении.',
    effects: ['Шум шагов на обычных поверхностях −1,2 % за уровень → −60 %', 'На необычных поверхностях −0,6 % → −30 %', 'Скорость скрытного движения +1 % → +50 %', 'Шум оружия и снаряжения −1,2 % → −60 %'],
    elite: ['Одинаково тихо на любой поверхности (−60 %)'],
    howTo: ['Движение на скорости ниже 25 % (у значка динамика нет полосок); опыт считается по дистанции при остановке'],
    rewardQuests: ['Profitable Venture'],
  },
  {
    id: 'Crafting', name: 'Ручное производство', nameEn: 'Crafting', group: 'practical', icon: 'skill_practical_crafting.png', wiki: W + 'Crafting',
    desc: 'Короче время крафтов, в том числе циклических.',
    effects: ['Время крафта −0,75 % за уровень → −37,5 %', 'Время циклического производства (кроме биткоин-фермы) −0,75 % → −37,5 %'],
    elite: ['Два разных крафта в одной зоне одновременно (и в ящике диких)'],
    howTo: ['Крафты в схроне: 1,5 очка за каждые 8 часов производства', '5 очков по завершении, если чередовать два разных рецепта в одном модуле', 'Один и тот же рецепт подряд в том же модуле — очков не даёт'],
    rewardQuests: ['The Huntsman Path - Relentless', 'Never Too Late To Learn', 'Profit Retention'],
  },
  {
    id: 'HeavyVests', name: 'Тяжёлые бронежилеты', nameEn: 'Heavy Vests', group: 'practical', icon: 'skill_practical_heavyarmor.png', wiki: W + 'Heavy_Vests',
    desc: 'Тяжёлая броня (сталь, керамика, комбинированные материалы, титан): меньше урона и штрафов.',
    effects: ['Штраф к скорости от тяжёлой брони −0,5 % за уровень → −25 %', 'Тупой урон через тяжёлую броню −0,4 % → −20 %', 'Износ при ремонте набором −1 % → −50 %'],
    elite: ['Шанс рикошета от тяжёлой брони', '50 % шанс не износить броню при ремонте'],
    howTo: ['Ремонт тяжёлой брони ремкомплектом: 0,4 очка за каждые 10 единиц', 'Урон по надетой тяжёлой броне: 0,01 очка за единицу прочности (129 % до первого очка, спад после второго)'],
    tips: ['С 3-го уровня при ремонте есть шанс получить усиление брони (оранжевая рамка): −3 %…−11 % входящего урона, на элите ещё редкое −20 %. Держится, пока деталь не потеряет 25 % прочности.'],
    rewardQuests: ['Safety Guarantee'],
  },
  {
    id: 'HideoutManagement', name: 'Управление убежищем', nameEn: 'Hideout Management', group: 'practical', icon: 'skill_practical_hideoutmanagement.png', wiki: W + 'Hideout_Management',
    desc: 'Меньше топлива и фильтров, сильнее бонусы зон схрона.',
    effects: ['Все процентные бонусы зон схрона +1 % за уровень → +50 %', 'Расход топлива, воздушных и водяных фильтров −0,5 % → −25 %'],
    elite: ['+2 слота под канистры', '+2 слота под водяные фильтры', '+2 слота под воздушные фильтры', '+2 к лимиту монет в биткоин-ферме'],
    howTo: ['0,8 очка за завершённый крафт (Библиотека этот навык не ускоряет)', 'Ящик диких', 'Трата ресурсов в схроне', '12 очков за каждое улучшение модуля'],
    rewardQuests: ['The Choice', 'Never Too Late To Learn', 'Profit Retention'],
  },
  {
    id: 'LightVests', name: 'Лёгкие бронежилеты', nameEn: 'Light Vests', group: 'practical', icon: 'skill_practical_lightarmor.png', wiki: W + 'Light_Vests',
    desc: 'Лёгкая броня (арамид, алюминий, UHMWPE): подвижность и меньше урона.',
    effects: ['Штраф к скорости от лёгкой брони −0,6 % за уровень → −30 %', 'Урон холодным оружием через лёгкую броню −0,6 % → −30 %', 'Износ при ремонте набором −0,8 % → −40 %'],
    elite: ['Части тела под лёгкой бронёй не кровоточат', '50 % шанс не износить броню при ремонте'],
    howTo: ['Ремонт лёгкой брони ремкомплектом: 0,4 очка за каждые 10 единиц', 'Урон по надетой лёгкой броне: 0,02 очка за единицу прочности (129 % до первого очка, спад после второго)'],
    tips: ['С 3-го уровня при ремонте есть шанс усиления брони (оранжевая рамка): −3 %…−11 % урона, на элите редкое −20 %.'],
    rewardQuests: ['Safety Guarantee'],
  },
  {
    id: 'MagDrills', name: 'Работа с магазинами', nameEn: 'Mag Drills', group: 'practical', icon: 'skill_practical_magazineloadingplaceholder.png', wiki: W + 'Mag_Drills',
    desc: 'Быстрее снаряжать, разряжать и проверять магазины.',
    effects: ['Скорость снаряжения +0,6 % за уровень → +30 %', 'Скорость разряжания +0,6 % → +30 %', 'Скорость проверки магазина +0,8 % → +40 %', 'С 10-го уровня проверка показывает «примерно N», с 20-го — точное число'],
    elite: ['Магазин проверяется мгновенно при попадании в инвентарь', 'Каждый следующий патрон снаряжается быстрее'],
    howTo: ['Проверка магазинов в рейде', 'Снаряжение и разряжание магазинов в рейде (в том числе трубчатых у дробовиков)'],
    rewardQuests: ['Never Too Late To Learn', 'Intimidator', 'Best Job in the World', 'Escort'],
  },
  {
    id: 'Search', name: 'Поиск', nameEn: 'Search', group: 'practical', icon: 'skill_practical_search.png', wiki: W + 'Search',
    desc: 'Быстрее обыск тел и контейнеров.',
    effects: ['Скорость обыска +1 % за уровень → +50 % (на практике скорость обыска определяет Внимательность)'],
    elite: ['Обыск двух контейнеров (рюкзак, разгрузка) одновременно'],
    howTo: ['Обыск контейнеров и тел', 'Подбор рассыпного лута'],
    rewardQuests: ['Bullshit', 'Profit Retention'],
  },
  {
    id: 'Surgery', name: 'Хирургия', nameEn: 'Surgery', group: 'practical', icon: 'Surgery.png', wiki: W + 'Surgery',
    desc: 'Быстрее и качественнее полевая хирургия.',
    effects: ['Скорость операции +0,4 % за уровень → +20 %', 'Штраф к максимуму ХП после операции −1 % → −50 %'],
    elite: ['Скорость операции ещё +20 % (итого +40 %)', 'Штраф −100 %: конечность восстанавливается с полным ХП'],
    howTo: ['1,1 очка за каждое применение CMS или Surv12 на чёрную конечность'],
    tips: ['В конце рейда чернить обе ноги (прыжок с высоты или друг стреляет) и оперировать: 4 операции за рейд — элита примерно за 1400 рейдов. Друг, отстреливающий конечности, качает заодно Жизнеспособность.'],
    rewardQuests: ['Crisis', 'Get a Foothold'],
  },
  {
    id: 'WeaponTreatment', name: 'Уход за оружием', nameEn: 'Weapon Maintenance', group: 'practical', icon: 'skill_practical_weapontreatment.png', wiki: W + 'Weapon_Maintenance',
    desc: 'Меньше износ оружия при стрельбе и ремонте.',
    effects: ['Износ при стрельбе −0,5 % за уровень → −25 %', 'Шанс износа при ремонте −1 % → −50 %'],
    elite: ['Шанс износа при ремонте набором ещё −50 %'],
    howTo: ['Ремонт оружия ремкомплектом в схроне: ~0,4 очка за каждые 5 единиц прочности'],
    tips: ['С 3-го уровня при ремонте есть шанс усиления оружия (оранжевая рамка): −3 %…−11 % разброса и −5 %…−16 % шанса неполадок, на элите редкие −20 % и −30 %. Держится, пока оружие не потеряет 5 % прочности.'],
    rewardQuests: ['Safety Guarantee', 'Consolation Prize'],
  },

  // ── Ментальные ──
  {
    id: 'Attention', name: 'Внимательность', nameEn: 'Attention', group: 'mental', icon: 'skill_mental_attention.png', wiki: W + 'Attention',
    desc: 'Быстрее обыск контейнеров и осмотр предметов.',
    effects: ['Скорость обыска +2 % за уровень → +100 %', 'Скорость осмотра предметов +2 % → +100 %'],
    elite: ['Двойной опыт за лутание', '50 % шанс мгновенно найти предмет в контейнере'],
    howTo: ['Подбор рассыпного лута', 'Обыск контейнеров: 0,08 очка за каждый найденный предмет'],
    rewardQuests: ['Silent Caliber', 'Profitable Venture', 'Profit Retention', 'Connections Up North'],
  },
  {
    id: 'Charisma', name: 'Харизма', nameEn: 'Charisma', group: 'mental', icon: 'skill_mental_charisma.png', wiki: W + 'Charisma',
    desc: 'Скидки на услуги. Прогресс общий у ЧВК и дикого.',
    effects: ['Замена оперативных заданий −0,1 % за уровень → −5 %', 'Лечение после рейда −0,1 % → −5 %', 'Страховка −0,1 % → −5 %', 'Платные выходы −0,1 % → −5 %'],
    elite: ['Ящик диких на 10 % дешевле', 'Штраф репутации Скупщика −50 % (при карме 6+)', 'Ещё одно ежедневное оперативное задание'],
    howTo: ['10 % очков Интеллекта и 20 % очков Внимательности и Восприятия капают сюда', 'Ящик диких: 0,4 очка за отправку', 'Страховка: 0,4 очка за каждые 200 000 ₽', 'Ремонт оружия и брони у торговцев: 0,4 очка за каждые 10 000 ₽'],
    rewardQuests: ['Special Order', 'A Life Lesson'],
  },
  {
    id: 'Intellect', name: 'Интеллект', nameEn: 'Intellect', group: 'mental', icon: 'skill_mental_intellect.png', wiki: W + 'Intellect',
    desc: 'Быстрее осмотр предметов, качественнее ремонт оружия.',
    effects: ['Скорость осмотра +2 % за уровень → +100 %', 'Эффективность ремонта оружия +2 % → +100 %', 'Расход ремкомплекта −0,5 % → −25 %'],
    elite: ['Счётчик патронов', 'Содержимое контейнера видно без обыска', 'Осмотр без инструкции'],
    howTo: ['Крафты в схроне', 'Ремонт брони ремкомплектом: 0,4 очка за ~10 единиц', 'Ремонт оружия ремкомплектом: 0,4 очка за ~10 единиц'],
    note: 'Элитные эффекты сейчас не работают.',
    rewardQuests: ['Psycho Sniper', 'A Life Lesson'],
  },
  {
    id: 'Perception', name: 'Восприятие', nameEn: 'Perception', group: 'mental', icon: 'skill_mental_perception.png', wiki: W + 'Perception',
    desc: 'Лут заметнее с расстояния.',
    effects: ['Радиус обнаружения лута +2 % за уровень → +100 %'],
    elite: ['Уведомление о луте поблизости'],
    howTo: ['Подбор любого лута'],
    rewardQuests: ['The Survivalist Path - Eagle-Owl', 'The Survivalist Path - Tough Guy', 'Psycho Sniper', 'Calibration', 'Profitable Venture', 'Profit Retention'],
  },
]

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]))

/** Найти навык по любому имени: id tarkov.dev, английское или русское название. */
export function findSkill(name: string): SkillDef | undefined {
  const n = name.trim().toLowerCase().replace(/[\s_-]/g, '')
  return SKILLS.find((s) => s.id.toLowerCase() === n || s.nameEn.toLowerCase().replace(/[\s_-]/g, '') === n || s.name.toLowerCase().replace(/[\s_-]/g, '') === n)
}
