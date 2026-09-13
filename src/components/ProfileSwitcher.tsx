import { useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { useProfile, useProfileList } from '@/store/profile'
import { Eyebrow } from './ui'

/** Переключатель персонажей: основной / сезонный / любой другой. */
export function ProfileSwitcher({ compact = false }: { compact?: boolean }) {
  const list = useProfileList()
  const switchProfile = useProfile((s) => s.switchProfile)
  const addProfile = useProfile((s) => s.addProfile)
  const deleteProfile = useProfile((s) => s.deleteProfile)
  const renameProfile = useProfile((s) => s.renameProfile)
  const activeName = useProfile((s) => s.name)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [seasonal, setSeasonal] = useState(true)
  const [pve, setPve] = useState(false)

  return (
    <div>
      {!compact && <Eyebrow>Персонаж</Eyebrow>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => switchProfile(p.id)}
            className={`chip ${p.active ? 'chip-on' : 'hover:text-ink hover:border-ink-4'}`}
            title={p.active ? 'Текущий персонаж' : 'Переключиться'}
          >
            {p.active && <Check size={12} />}
            {p.name}
            <span className="num opacity-60">{p.level}</span>
            {p.gameMode === 'pvp-season' && <span className="text-[9px] tracking-[.12em] opacity-70">сезон</span>}
            {p.gameMode === 'pve' && <span className="text-[9px] tracking-[.12em] text-info">PvE</span>}
          </button>
        ))}
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="chip hover:text-ink hover:border-ink-4"><Plus size={12} /> Добавить</button>
        ) : (
          <form
            className="inline-flex items-center gap-1.5"
            onSubmit={(e) => { e.preventDefault(); addProfile(name, seasonal, pve ? 'pve' : 'regular'); setAdding(false); setName('') }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={seasonal ? 'Сезонный' : 'Имя'} className="input focus:input-focus h-7 w-32 text-[12px]" />
            <label className="inline-flex items-center gap-1 text-[12px] text-ink-2 cursor-pointer">
              <input type="checkbox" checked={seasonal} onChange={(e) => setSeasonal(e.target.checked)} className="accent-brass" /> сезонный
            </label>
            {!seasonal && (
              <label className="inline-flex items-center gap-1 text-[12px] text-ink-2 cursor-pointer">
                <input type="checkbox" checked={pve} onChange={(e) => setPve(e.target.checked)} className="accent-brass" /> PvE
              </label>
            )}
            <button type="submit" className="chip chip-on">Создать</button>
            <button type="button" onClick={() => setAdding(false)} className="chip">Отмена</button>
          </form>
        )}
      </div>
      {!compact && (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-3">
          <span>Имя:</span>
          <input value={activeName} onChange={(e) => renameProfile(e.target.value)} className="input focus:input-focus h-7 w-40 text-[12px]" />
          {list.length > 1 && (
            <button type="button" onClick={() => { if (confirm(`Удалить персонажа «${activeName}» со всем прогрессом?`)) deleteProfile(list.find((p) => p.active)!.id) }} className="chip hover:text-danger hover:border-danger/60">
              <Trash2 size={12} /> Удалить
            </button>
          )}
        </div>
      )}
    </div>
  )
}
