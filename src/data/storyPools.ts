/**
 * «Сюжетные пулы» квестов торговцев (EFT 1.0). У ~160 квестов tarkov.dev вместо предшественников стоит
 * otherRequirements: globalVariable ≥ N. По сверке с вики (сентябрь 2026) каждая переменная — это пул квестов
 * одного торговца на одном уровне лояльности, а N — этап внутри пула: 1 — открывается сразу с уровнем,
 * 3 и 5 — после выполнения квестов пула (считаем этап = 1 + выполненных квестов этого пула).
 * Уровень лояльности для пулов без явного упоминания на вики выведен по минимальному уровню квестов — помечено ≈.
 */
export const STORY_POOLS: Record<string, { trader: string; ll: number }> = {
  '6a43a01ccc83aceedd35f09c': { trader: 'jaeger', ll: 1 }, // Егерь LL1 ≈
  '6a43a095bfef0cd74c298963': { trader: 'jaeger', ll: 2 }, // Егерь LL2 ≈
  '6a43a13633c97d216dfc85de': { trader: 'jaeger', ll: 3 }, // Егерь LL3
  '6a43a16dde81644a7951f31b': { trader: 'jaeger', ll: 4 }, // Егерь LL4
  '6a3171c927ca9591bf4db1c4': { trader: 'mechanic', ll: 1 }, // Механик LL1
  '6a3c0fefbea2d2ad581c090b': { trader: 'mechanic', ll: 2 }, // Механик LL2
  '6a3cf95c6b35530c4a4f532e': { trader: 'mechanic', ll: 3 }, // Механик LL3 ≈
  '6a3d1c0990e9ffe15463e961': { trader: 'mechanic', ll: 4 }, // Механик LL4
  '6a5ba40fe5c4eaef5610f232': { trader: 'peacekeeper', ll: 1 }, // Миротворец LL1
  '6a5ba450a7851e16ce0bde44': { trader: 'peacekeeper', ll: 2 }, // Миротворец LL2
  '6a5ba48b8cfd0bddb3d4d2e1': { trader: 'peacekeeper', ll: 3 }, // Миротворец LL3
  '6a5ba4c57cbb93b629051591': { trader: 'peacekeeper', ll: 4 }, // Миротворец LL4
  '6a20540cf1b67a977cc5a088': { trader: 'prapor', ll: 1 }, // Прапор LL1
  '6a2688488bba18e0b0187a04': { trader: 'prapor', ll: 2 }, // Прапор LL2
  '6a32651a811905ed0cac0973': { trader: 'prapor', ll: 3 }, // Прапор LL3
  '6a326525789ae12ecb0b2807': { trader: 'prapor', ll: 4 }, // Прапор LL4
  '6a4b339f18db62e03b4f7ded': { trader: 'ragman', ll: 1 }, // Барахольщик LL1
  '6a4b4e6a30dac4b01af220aa': { trader: 'ragman', ll: 2 }, // Барахольщик LL2
  '6a4b9c9a60b56d421cceea18': { trader: 'ragman', ll: 3 }, // Барахольщик LL3
  '6a59f3ba06c8949abad30871': { trader: 'skier', ll: 1 }, // Лыжник LL1
  '6a5a111de1f417ac80a163e5': { trader: 'skier', ll: 2 }, // Лыжник LL2
  '6a5a115181116e807b55f258': { trader: 'skier', ll: 3 }, // Лыжник LL3
  '6a5a1192efde11cc7105b18f': { trader: 'skier', ll: 4 }, // Лыжник LL4
  '6a4e4ab3ecd1145894d00990': { trader: 'therapist', ll: 1 }, // Терапевт LL1
  '6a4e4aed3ded7a18126603f6': { trader: 'therapist', ll: 2 }, // Терапевт LL2
  '6a4e4b28629dc64c4001967c': { trader: 'therapist', ll: 3 }, // Терапевт LL3 ≈
  '6a56925b1c30ba5a77c7c518': { trader: 'therapist', ll: 4 }, // Терапевт LL4 ≈
}
