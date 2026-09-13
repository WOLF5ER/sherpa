import type { Item } from '@/data/types'
import { useUI } from '@/store/ui'

interface Props {
  item: Item
  /** размер ячейки в px (одна клетка схрона) */
  size?: number
  count?: number
  fir?: boolean
  /** показывать реальную форму предмета (2×1 и т.п.) */
  shape?: boolean
  onClick?: () => void
  className?: string
  title?: string
  /** без своей кнопки — когда ячейка лежит внутри другой кнопки или ссылки */
  static?: boolean
}

/**
 * Ячейка схрона: игровой цвет фона, иконка, счётчик как в инвентаре,
 * галочка FIR. Подпись размера в слотах — потому что слот = деньги.
 */
export function ItemCell({ item, size = 48, count, fir, shape = false, onClick, className = '', title, static: isStatic = false }: Props) {
  const open = useUI((s) => s.openItem)
  const w = shape ? size * Math.min(item.width, 4) : size
  const h = shape ? size * Math.min(item.height, 4) : size
  const handle = onClick ?? (() => open(item.id))
  const cls = `ibg-${item.bg} relative shrink-0 rounded-[3px] border border-line-2/80 overflow-hidden inline-block align-middle
        hover:border-brass-3 focus-visible:border-brass transition-colors ${className}`
  const inner = (
    <>
      <img
        src={item.iconLink}
        alt=""
        loading="lazy"
        draggable={false}
        className="w-full h-full object-contain p-[2px] select-none"
        style={{ imageRendering: 'auto' }}
      />
      {count != null && count > 1 && (
        <span className="cell-count num absolute right-[3px] top-[1px] text-[11px] font-semibold text-cell drop-shadow-[0_0_2px_#000]">
          {count}
        </span>
      )}
      {fir && (
        <span
          className="absolute left-[2px] top-[2px] w-[9px] h-[9px] rounded-full bg-fir shadow-[0_0_0_1.5px_#0b0d0a]"
          title="Найдено в рейде"
        />
      )}
    </>
  )
  if (isStatic) {
    return <span className={cls} style={{ width: w, height: h }} title={title ?? item.name}>{inner}</span>
  }
  return (
    <button type="button" onClick={handle} title={title ?? item.name} className={cls} style={{ width: w, height: h }}>
      {inner}
    </button>
  )
}

export function SlotSize({ item }: { item: Item }) {
  return (
    <span className="num text-[11px] text-ink-3">{item.width}×{item.height}</span>
  )
}
