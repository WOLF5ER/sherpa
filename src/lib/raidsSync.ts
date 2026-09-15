import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type { LauncherApi } from './pywebview'
import { useCloud } from './cloud'
import { useRaids, INDEX_KEY, DELETED_KEY, raidKey, type Raid, type RaidSummary } from '@/store/raids'

/**
 * История рейдов в облаке. Треки большие (сотни точек за рейд), поэтому не в общем снимке, а отдельно:
 * индекс + документ на каждый рейд. Слияние по рейдам: у кого поле `u` (когда менялся) больше — тот и прав;
 * удалённые — надгробия в `deleted` (id → когда удалили), чтобы стёртый рейд не воскрес с другого ПК.
 */
interface RaidsIndex { list: RaidSummary[]; deleted: Record<string, number> }

let api: LauncherApi | null = null
let timer: number | null = null
let running = false
let again = false

const stamp = (r: { u?: number; end: number }) => r.u ?? r.end

async function req<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
  const r = await api!.cloud_req!(method, path, body === undefined ? null : JSON.stringify(body))
  let data: T | null = null
  if (r.status === 200 && r.body) { try { data = JSON.parse(r.body) as T } catch { data = null } }
  return { status: r.status, data }
}

export async function syncRaids(): Promise<void> {
  if (!api?.cloud_req || !useCloud.getState().info?.user) return
  if (running) { again = true; return }
  running = true
  try {
    const store = useRaids.getState()
    if (!store.loaded) await store.init()
    const local = useRaids.getState().list
    const localDeleted = (await idbGet<Record<string, number>>(DELETED_KEY).catch(() => undefined)) ?? {}
    const res = await req<RaidsIndex>('GET', '/raids')
    if (res.status !== 200 && res.status !== 204) return
    const remote: RaidsIndex = res.data ?? { list: [], deleted: {} }
    const deleted: Record<string, number> = { ...remote.deleted, ...localDeleted }
    for (const [id, t] of Object.entries(localDeleted)) if ((remote.deleted[id] ?? 0) > t) deleted[id] = remote.deleted[id]

    const byLocal = new Map(local.map((r) => [r.id, r]))
    const byRemote = new Map(remote.list.map((r) => [r.id, r]))
    const merged = new Map<string, RaidSummary>()
    const current = useRaids.getState().current

    // удалённые где-то — убираем везде (если удалили позже последнего изменения)
    for (const [id, t] of Object.entries(deleted)) {
      const l = byLocal.get(id)
      if (l && stamp(l) <= t) { byLocal.delete(id); await idbDel(raidKey(id)).catch(() => {}) }
      const r = byRemote.get(id)
      if (r && stamp(r) <= t) { byRemote.delete(id); await req('DELETE', `/raids/${id}`) }
    }

    // из облака — чего нет локально или там новее
    for (const [id, r] of byRemote) {
      const l = byLocal.get(id)
      if (l && stamp(l) >= stamp(r)) { merged.set(id, l); continue }
      if (current?.id === id) { merged.set(id, l ?? r); continue } // идущий рейд не перетираем
      const doc = await req<Raid>('GET', `/raids/${id}`)
      if (doc.status === 200 && doc.data) {
        await idbSet(raidKey(id), doc.data).catch(() => {})
        merged.set(id, r)
      } else if (l) merged.set(id, l)
    }
    // в облако — чего нет там или локально новее
    for (const [id, l] of byLocal) {
      if (merged.get(id) === l && byRemote.has(id) && stamp(byRemote.get(id)!) >= stamp(l)) continue
      merged.set(id, l)
      const doc = current?.id === id ? current : await idbGet<Raid>(raidKey(id)).catch(() => undefined)
      if (doc) await req('PUT', `/raids/${id}`, doc)
    }

    const list = [...merged.values()].sort((a, b) => b.start - a.start)
    // надгробия старше 90 дней уже никого не спасут — чистим
    const cutoff = Date.now() - 90 * 86400_000
    for (const id of Object.keys(deleted)) if (deleted[id] < cutoff) delete deleted[id]
    await req('PUT', '/raids', { list, deleted } satisfies RaidsIndex)
    await idbSet(INDEX_KEY, list).catch(() => {})
    await idbSet(DELETED_KEY, deleted).catch(() => {})
    useRaids.setState({ list })
  } catch (e) {
    console.warn('[sherpa] рейды в облако:', e)
  } finally {
    running = false
    if (again) { again = false; void syncRaids() }
  }
}

/** Синхронизировать чуть позже (после серии изменений). */
export function syncRaidsSoon(delay = 5000) {
  if (!api) return
  if (timer != null) clearTimeout(timer)
  timer = window.setTimeout(() => { timer = null; void syncRaids() }, delay)
}

export function installRaidsSync(a: LauncherApi) {
  api = a
  if (!a.cloud_req) return
  useRaids.getState().onChanged = () => syncRaidsSoon()
  void syncRaids()
  // раз в 5 минут — на случай, если рейд идёт долго и хочется видеть его на телефоне/другом ПК
  setInterval(() => { if (!document.hidden) void syncRaids() }, 5 * 60 * 1000)
}
