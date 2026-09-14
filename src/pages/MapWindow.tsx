import { useEffect } from 'react'
import { useUI } from '@/store/ui'
import { useProfile } from '@/store/profile'
import { MapsPage } from './Maps'
import { ItemDrawer } from '@/components/ItemDrawer'
import { Lightbox } from '@/components/WikiPics'

/**
 * Отдельное окно карты (F7): только раздел «Карты» без меню и шапки, поверх игры.
 * Свой store: отметки квестов и смена карты уходят в localStorage, главное окно и мини-карта их подхватывают.
 */
export function MapWindowPage() {
  const theme = useUI((s) => s.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.body.style.overflow = 'hidden'
  }, [theme])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') useUI.getState().closeItem() }
    // главное окно отметило квест / сменило профиль или карту — перечитываем
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'sherpa:profile') void useProfile.persist.rehydrate()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('storage', onStorage) }
  }, [])
  return (
    <div className="h-full relative isolate">
      <MapsPage standalone />
      <ItemDrawer />
      <Lightbox />
    </div>
  )
}
