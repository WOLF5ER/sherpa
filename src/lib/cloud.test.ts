import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountInfo, LauncherApi, StateBackup } from './pywebview'
import { cloudPush, installCloud, useCloud } from './cloud'

function backup(): StateBackup {
  return {
    savedAt: 1_800_000_000_000,
    keys: {
      'sherpa:profile': JSON.stringify({
        state: {
          level: 42,
          completed: { task1: true },
          ttToken: 'ACTIVE_SECRET',
          profiles: {
            second: { name: 'Второй', level: 20, ttToken: 'SECOND_SECRET' },
          },
        },
        version: 8,
      }),
      'sherpa:ui': JSON.stringify({ state: { theme: 'dark' }, version: 1 }),
    },
  }
}

const info: AccountInfo = {
  user: { id: 'discord-user', name: 'Player', avatar: null },
  stage: 'ok', error: '', synced_at: 0, cloud_url: 'https://example.test',
}

describe('облачная отправка профиля', () => {
  it('cloudPush не отправляет токены TarkovTracker активного и сохранённых профилей', async () => {
    const put = vi.fn(async (_text: string) => ({ ok: true }))
    const api = { cloud_put: put } as unknown as LauncherApi
    await installCloud(api, backup, () => true)
    useCloud.setState({ info, busy: false })

    await cloudPush(backup())

    expect(put).toHaveBeenCalledOnce()
    const sent = JSON.parse(put.mock.calls[0][0]) as StateBackup
    expect(sent.keys['sherpa:profile']).not.toContain('ACTIVE_SECRET')
    expect(sent.keys['sherpa:profile']).not.toContain('SECOND_SECRET')
    const profile = JSON.parse(sent.keys['sherpa:profile'])
    expect(profile.state.ttToken).toBeUndefined()
    expect(profile.state.profiles.second.ttToken).toBeUndefined()
    expect(profile.state.level).toBe(42)
    expect(profile.state.profiles.second.name).toBe('Второй')
    expect(sent.keys['sherpa:ui']).toBe(backup().keys['sherpa:ui'])
  })

  it('sync также очищает токены перед отправкой', async () => {
    const put = vi.fn(async (_text: string) => ({ ok: true }))
    const api = { cloud_get: vi.fn(async () => null), cloud_put: put } as unknown as LauncherApi
    await installCloud(api, backup, () => true)
    useCloud.setState({ info, busy: false })

    await useCloud.getState().sync()

    expect(put).toHaveBeenCalledOnce()
    const sent = JSON.parse(put.mock.calls[0][0]) as StateBackup
    expect(sent.keys['sherpa:profile']).not.toContain('ACTIVE_SECRET')
    expect(sent.keys['sherpa:profile']).not.toContain('SECOND_SECRET')
  })
})

describe('облачное восстановление профиля', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('сохраняет локальные токены при применении снимка из облака', async () => {
    const local = backup()
    const remote = backup()
    remote.savedAt += 10_000
    const remoteProfile = JSON.parse(remote.keys['sherpa:profile'])
    delete remoteProfile.state.ttToken
    delete remoteProfile.state.profiles.second.ttToken
    remoteProfile.state.level = 50
    remote.keys['sherpa:profile'] = JSON.stringify(remoteProfile)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'sherpa:profile' ? local.keys['sherpa:profile'] : null,
    })
    const apply = vi.fn((_snapshot: StateBackup) => false)
    const api = {
      cloud_get: vi.fn(async () => remote),
      cloud_put: vi.fn(async (_text: string) => ({ ok: true })),
    } as unknown as LauncherApi
    await installCloud(api, backup, apply)
    useCloud.setState({ info, busy: false })

    await useCloud.getState().sync()

    expect(apply).toHaveBeenCalledOnce()
    const applied = apply.mock.calls[0][0]
    const profile = JSON.parse(applied.keys['sherpa:profile'])
    expect(profile.state.level).toBe(50)
    expect(profile.state.ttToken).toBe('ACTIVE_SECRET')
    expect(profile.state.profiles.second.ttToken).toBe('SECOND_SECRET')
  })
})
