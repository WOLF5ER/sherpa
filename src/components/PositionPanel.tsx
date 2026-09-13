import { useEffect, useState } from 'react'
import { FolderOpen, Crosshair, Route, Layers, Compass, Smartphone } from 'lucide-react'
import { useUI } from '@/store/ui'
import { useLauncher, type LauncherState } from '@/lib/pywebview'
import { canPickFolder, pickScreenshotsFolder, savedFolder, folderPermission, forgetFolder } from '@/lib/screenshots'
import { heading } from '@/lib/floors'
import { Eyebrow, Toggle } from './ui'

/** Панель «Ты здесь»: источник позиции (лаунчер / папка в браузере / по сети), след, авто-этаж, компас. */
export function PositionPanel({ cardinalRotation, floorName }: { cardinalRotation: number; floorName: string | null }) {
  const launcher = useLauncher()
  const playerPos = useUI((s) => s.playerPos)
  const trail = useUI((s) => s.trail)
  const clearTrail = useUI((s) => s.clearTrail)
  const screenshotsWatch = useUI((s) => s.screenshotsWatch)
  const setScreenshotsWatch = useUI((s) => s.setScreenshotsWatch)
  const follow = useUI((s) => s.followPlayer)
  const setFollow = useUI((s) => s.setFollowPlayer)
  const autoFloor = useUI((s) => s.autoFloor)
  const setAutoFloor = useUI((s) => s.setAutoFloor)
  const folderStatus = useUI((s) => s.folderStatus)
  const setFolderStatus = useUI((s) => s.setFolderStatus)
  const [err, setErr] = useState<string | null>(null)
  const [lstate, setLstate] = useState<LauncherState | null>(null)
  const [pathEdit, setPathEdit] = useState<string | null>(null)

  // у лаунчера спрашиваем, за какой папкой он следит и нашлась ли она
  useEffect(() => {
    if (!launcher) return
    const poll = () => launcher.get_state().then(setLstate).catch(() => {})
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [launcher, screenshotsWatch])
  const savePath = async () => {
    if (!launcher?.set_screenshots_path || pathEdit == null) return
    try { setLstate(await launcher.set_screenshots_path(pathEdit.trim())) } catch { /* ignore */ }
    setPathEdit(null)
  }

  const pick = async () => {
    setErr(null)
    try {
      const h = await pickScreenshotsFolder()
      if (!h) return
      setFolderStatus('granted')
      setScreenshotsWatch(true)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setErr('Не удалось открыть папку')
    }
  }
  const resume = async () => {
    const h = await savedFolder()
    if (!h) { setFolderStatus('none'); return }
    const p = await folderPermission(h, true)
    setFolderStatus(p === 'granted' ? 'granted' : 'prompt')
    if (p === 'granted') setScreenshotsWatch(true)
  }

  const hd = playerPos ? heading(playerPos.rotation, cardinalRotation) : null
  const age = playerPos ? Math.round((Date.now() - playerPos.ts) / 1000) : null

  return (
    <div>
      <Eyebrow>Ты здесь</Eyebrow>

      {/* источник */}
      {launcher ? (
        <div className="mt-1.5 flex flex-col gap-1">
          <Toggle value={screenshotsWatch} onChange={setScreenshotsWatch} label="Следить за скриншотами" />
          {lstate && pathEdit == null && (
            <button type="button" onClick={() => setPathEdit(lstate.screenshots_path)} title="Сменить папку" className={`text-left text-[11px] num leading-4 break-all ${lstate.screenshots_path_exists === false ? 'text-danger' : 'text-ink-4 hover:text-ink-2'}`}>
              {lstate.screenshots_path_exists === false ? 'папка не найдена: ' : ''}{lstate.screenshots_path || '—'}
            </button>
          )}
          {pathEdit != null && (
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void savePath() }}>
              <input autoFocus value={pathEdit} onChange={(e) => setPathEdit(e.target.value)} placeholder="Путь к папке Screenshots (пусто — авто)" spellCheck={false} className="input focus:input-focus num h-7 text-[11px] flex-1" />
              <button type="submit" className="chip chip-on">Ок</button>
              <button type="button" onClick={() => setPathEdit(null)} className="chip">Отмена</button>
            </form>
          )}
        </div>
      ) : folderStatus === 'unsupported' ? (
        <div className="mt-1.5 text-[11px] text-ink-3 leading-4">Этот браузер не умеет читать папки. Открой Sherpa в Chrome/Edge или через <span className="num">start.bat</span>.</div>
      ) : folderStatus === 'granted' ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <Toggle value={screenshotsWatch} onChange={setScreenshotsWatch} label="Следить за скриншотами" />
          <button type="button" onClick={async () => { await forgetFolder(); setFolderStatus('none'); setScreenshotsWatch(false) }} className="text-[11px] text-ink-4 hover:text-ink-2 text-left">сменить папку</button>
        </div>
      ) : folderStatus === 'prompt' ? (
        <button type="button" onClick={resume} className="mt-1.5 chip chip-on"><FolderOpen size={12} /> Продолжить следить за папкой</button>
      ) : (
        <button type="button" onClick={pick} className="mt-1.5 chip chip-on"><FolderOpen size={12} /> Выбрать папку скриншотов</button>
      )}
      {err && <div className="mt-1 text-[11px] text-danger">{err}</div>}
      <div className="mt-1 text-[11px] text-ink-3 leading-4">
        В игре: назначь клавишу Screenshot и режим окна «Без рамки». Жми её в рейде — Тарков пишет координаты в имя файла, точка обновится сама.
        Папка: <span className="num">Документы\Escape from Tarkov\Screenshots</span> (если «Документы» в OneDrive — лаунчер найдёт и там). Сами картинки никуда не уходят.
      </div>

      {/* состояние */}
      {playerPos ? (
        <div className="mt-2 panel px-2.5 py-2 text-[12px] flex flex-col gap-1">
          <div className="flex items-center gap-2"><Crosshair size={12} className="text-brass-2" /><span className="num text-ink">{playerPos.x.toFixed(0)}, {playerPos.z.toFixed(0)}</span><span className="text-ink-3 num">h {playerPos.y.toFixed(1)}</span><span className="ml-auto text-ink-4 num">{age! < 60 ? `${age} с` : `${Math.round(age! / 60)} мин`}</span></div>
          <div className="flex items-center gap-2 text-ink-2"><Compass size={12} className="text-ink-3" /><span className="num">{hd!.deg}°</span><span>{hd!.label}</span>{floorName && <span className="ml-auto inline-flex items-center gap-1 text-ink-3"><Layers size={11} />{floorName}</span>}</div>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-ink-4">Ожидаю скриншот…</div>
      )}

      <div className="mt-2 flex flex-col gap-1.5">
        <Toggle value={follow} onChange={setFollow} label="Карта следует за точкой" />
        <Toggle value={autoFloor} onChange={setAutoFloor} label="Авто-этаж по высоте" />
      </div>
      {trail.length > 0 && (
        <button type="button" onClick={clearTrail} className="mt-1.5 chip hover:text-ink"><Route size={12} /> Сбросить след ({trail.length})</button>
      )}
      {launcher && (
        <div className="mt-2 text-[11px] text-ink-4 leading-4 inline-flex items-start gap-1"><Smartphone size={11} className="mt-[2px]" /><span>Телефон: включи «Доступ по сети» в профиле и открой адрес оттуда — точка будет и там.</span></div>
      )}
      {!launcher && !canPickFolder() && null}
    </div>
  )
}
