const NAMES: Record<string, string> = {
  Caliber556x45NATO: '5.56x45', Caliber545x39: '5.45x39', Caliber762x39: '7.62x39', Caliber762x51: '7.62x51',
  Caliber762x54R: '7.62x54R', Caliber9x19PARA: '9x19', Caliber9x18PM: '9x18', Caliber9x21: '9x21', Caliber9x39: '9x39',
  Caliber366TKM: '.366 ТКМ', Caliber1143x23ACP: '.45 ACP', Caliber46x30: '4.6x30', Caliber57x28: '5.7x28',
  Caliber762x25TT: '7.62x25', Caliber12g: '12/70', Caliber20g: '20/70', Caliber23x75: '23x75', Caliber86x70: '.338 Lapua',
  Caliber127x55: '12.7x55', Caliber68x51: '6.8x51', Caliber40x46: '40x46 (ГП)', Caliber40mmRU: '40 мм (ГП-25)',
  Caliber26x75: '26x75 (ракетница)', Caliber30x29: '30x29', Caliber127x108: '12.7x108', Caliber762x35: '.300 BLK',
  Caliber9x33R: '.357', Caliber20x1mm: '20x1 (пневм.)', Caliber7mm: '7 мм', Caliber6x35: '6x35',
}

export function caliberName(id: string): string {
  if (!id) return '—'
  return NAMES[id] ?? id.replace(/^Caliber/, '')
}

/** Сравнение пробития с классом брони: ≥ класс×10 — пробьёт уверенно. */
export function penClass(pen: number): number {
  return Math.max(0, Math.min(6, Math.floor(pen / 10)))
}
