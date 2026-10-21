// The polling rule of War detail's results (war-spec.md §10.4): a published
// War's results are polled every 30 seconds; a removed War's are not.
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../../api/client'
import { buildRankingsResponse } from '../../mocks/fixtures'
import { useRankings } from '../useRankings'

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  return { ...actual, getRankings: vi.fn() }
})

const POLL_INTERVAL_MS = 30_000

describe('useRankings', () => {
  beforeEach(() => {
    vi.mocked(client.getRankings).mockResolvedValue(buildRankingsResponse())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(client.getRankings).mockReset()
  })

  async function loadedAfterOnePollInterval(polling: boolean): Promise<number> {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => useRankings('war-1', polling))
    await waitFor(() => expect(result.current.status).toBe('loaded'))
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    return vi.mocked(client.getRankings).mock.calls.length
  }

  it('polls the results of a published War', async () => {
    // Arrange
    const polling = true

    // Act
    const requests = await loadedAfterOnePollInterval(polling)

    // Assert
    expect(requests).toBe(2)
  })

  it('does not poll the results when polling is off', async () => {
    // Arrange
    const polling = false

    // Act
    const requests = await loadedAfterOnePollInterval(polling)

    // Assert
    expect(requests).toBe(1)
  })
})
