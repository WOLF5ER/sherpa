import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerPos } from '@/lib/pywebview'

vi.mock('idb-keyval', () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
  del: vi.fn(async () => undefined),
}))

import { useRaids } from './raids'

const START = 1_800_000_000_000

function position(ts: number): PlayerPos {
  return { x: 10, y: 2, z: 20, rotation: 90, file: 'screenshot.png', ts }
}

describe('endLogRaid', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useRaids.setState({ loaded: true, list: [], current: null, onChanged: null })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('завершает текущий рейд, а следующий скриншот начинает новый', () => {
    useRaids.getState().beginLogRaid({ sid: 'session-1', mapId: 'customs', start: START })
    useRaids.getState().record(position(START + 1000), 'customs')
    const finishedId = useRaids.getState().current!.id

    useRaids.getState().endLogRaid({
      sid: 'session-1', mapId: 'customs', start: START, end: START + 60_000, outcome: 'survived',
    })

    expect(useRaids.getState().current).toBeNull()
    expect(useRaids.getState().list[0]).toMatchObject({ id: finishedId, end: START + 60_000, outcome: 'survived' })

    useRaids.getState().record(position(START + 61_000), 'customs')
    expect(useRaids.getState().current?.id).not.toBe(finishedId)
    expect(useRaids.getState().list).toHaveLength(2)
  })
})
