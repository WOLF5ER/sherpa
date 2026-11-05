/**
 * Ручное закрепление фракции квеста: id → 'BEAR' | 'USEC'.
 *
 * Зачем: tarkov.dev размечает фракцию не у всех квестов (17 BEAR + 17 USEC, остальные 469 — Any),
 * а tarkov-data-overlay, откуда приходят остальные метки, стал приватным. Здесь лежат квесты, фракция
 * которых проверена по данным TarkovTracker (оверлей v1.173 от 02.11.2026): даже если источник данных
 * соврёт или пропадёт, в «Задачах» чужой квест не появится.
 *
 * Как добавить: найти квест на tarkov.dev (id — в адресе карточки) и дописать строку.
 * Значение применяется после оверлея и им не перетирается.
 */
export const FACTION_FIXES: Record<string, 'BEAR' | 'USEC'> = {
  // BEAR
  '59c124d686f774189b3c843f': 'BEAR', // 59c124d686f774189b3c843f name
  '5ae3270f86f77445ba41d4dd': 'BEAR', // 5ae3270f86f77445ba41d4dd name
  '5ae3277186f7745973054106': 'BEAR', // 5ae3277186f7745973054106 name
  '5ae327c886f7745c7b3f2f3f': 'BEAR', // 5ae327c886f7745c7b3f2f3f name
  '5ae3280386f7742a41359364': 'BEAR', // 5ae3280386f7742a41359364 name
  '5ae4493486f7744efa289417': 'BEAR', // 5ae4493486f7744efa289417 name
  '5b478eca86f7744642012254': 'BEAR', // 5b478eca86f7744642012254 name
  '5d25e43786f7740a212217fa': 'BEAR', // 5d25e43786f7740a212217fa name
  '5e381b0286f77420e3417a74': 'BEAR', // 5e381b0286f77420e3417a74 name
  '5e4d4ac186f774264f758336': 'BEAR', // 5e4d4ac186f774264f758336 name
  '6179b5b06e9dd54ac275e409': 'BEAR', // 6179b5b06e9dd54ac275e409 name
  '639136d68ba6894d155e77cf': 'BEAR', // 639136d68ba6894d155e77cf name
  '639136df4b15ca31f76bc31f': 'BEAR', // 639136df4b15ca31f76bc31f name
  '639dbaf17c898a131e1cffff': 'BEAR', // 639dbaf17c898a131e1cffff name
  '65733403eefc2c312a759ddb': 'BEAR', // 65733403eefc2c312a759ddb name
  '6613f3007f6666d56807c929': 'BEAR', // 6613f3007f6666d56807c929 name
  '6613f307fca4f2f386029409': 'BEAR', // 6613f307fca4f2f386029409 name
  '67af4c169d95ad16e004fd86': 'BEAR', // Гарантия безопасности
  '67af4c1cc0e59d55e2010b97': 'BEAR', // Жизненный урок
  '5a27b7d686f77460d847e6a6': 'BEAR', // Металлолом
  '67af4c1a6c3ebfd8e6034916': 'BEAR', // Фиксация прибыли
  // USEC
  '5967725e86f774601a446662': 'USEC', // 5967725e86f774601a446662 name
  '5ac244eb86f7741356335af1': 'USEC', // 5ac244eb86f7741356335af1 name
  '5ae4493d86f7744b8e15aa8f': 'USEC', // 5ae4493d86f7744b8e15aa8f name
  '5b47799d86f7746c5d6a5fd8': 'USEC', // 5b47799d86f7746c5d6a5fd8 name
  '5b478ff486f7744d184ecbbf': 'USEC', // 5b478ff486f7744d184ecbbf name
  '5d25e2c386f77443e7549029': 'USEC', // 5d25e2c386f77443e7549029 name
  '5e383a6386f77465910ce1f3': 'USEC', // 5e383a6386f77465910ce1f3 name
  '5e4d515e86f77438b2195244': 'USEC', // 5e4d515e86f77438b2195244 name
  '6179b5eabca27a099552e052': 'USEC', // 6179b5eabca27a099552e052 name
  '639135c3744e452011470807': 'USEC', // 639135c3744e452011470807 name
  '639282134ed9512be67647ed': 'USEC', // 639282134ed9512be67647ed name
  '639872fa9b4fb827b200d8e5': 'USEC', // 639872fa9b4fb827b200d8e5 name
  '639872fc93ae507d5858c3a6': 'USEC', // 639872fc93ae507d5858c3a6 name
  '6573382e557ff128bf3da536': 'USEC', // 6573382e557ff128bf3da536 name
  '66151401efb0539ae10875ae': 'USEC', // 66151401efb0539ae10875ae name
  '6615141bfda04449120269a7': 'USEC', // 6615141bfda04449120269a7 name
  '6a45208043b8d7604d00b8d5': 'USEC', // 6a45208043b8d7604d00b8d5 name
  '67af4c1405c58dc6f7056667': 'USEC', // Выгодное предприятие
  '59ca1a6286f774509a270942': 'USEC', // Железные доказательства
  '67af4c1991ee75c6d7060a16': 'USEC', // Закрепиться на позиции
  '5a27b7a786f774579c3eb376': 'USEC', // Сафари на тигра
  '67af4c17f4f1fb58a907f8f6': 'USEC', // Учиться никогда не поздно
}

/** Проставить фракцию из таблицы поверх сырых задач. Возвращает число исправленных задач. */
export function applyFactionFixes(tasks: Record<string, { factionName?: string }>): number {
  let n = 0
  for (const [id, faction] of Object.entries(FACTION_FIXES)) {
    const t = tasks[id]
    if (t && t.factionName !== faction) { t.factionName = faction; n++ }
  }
  return n
}
