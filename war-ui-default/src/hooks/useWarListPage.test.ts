// Covers the shared paging/sorting/searching logic Home and MyWars both use
// (useWarListPage): the pure state-machine parts that don't need a real
// browser, per CLAUDE.md's guidance ("Unit tests ... for client.ts logic
// and pure functions"). Page-level wiring (the sort <select>, the search
// <input>, the Prev/Next buttons) is covered by the Playwright acceptance
// suite instead (browse-wars.spec.ts, my-wars.spec.ts).
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { buildWarSummary } from '../mocks/fixtures'
import { useWarListPage } from './useWarListPage'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, getWars: vi.fn() }
})

function pageResponse(wars: ReturnType<typeof buildWarSummary>[], nextCursor: string | null = null) {
  return { wars, next_cursor: nextCursor }
}

describe('useWarListPage', () => {
  afterEach(() => {
    vi.mocked(client.getWars).mockReset()
  })

  it('fetches page 1 with the default "newest" sort and no cursor on mount', async () => {
    // Arrange
    vi.mocked(client.getWars).mockResolvedValue(pageResponse([buildWarSummary({ id: 'w1' })]))

    // Act
    const { result } = renderHook(() => useWarListPage())
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))

    // Assert
    expect(client.getWars).toHaveBeenCalledWith({ sort: 'newest', limit: '10' })
  })

  it('includes creator=me when creatorMe is requested (MyWars)', async () => {
    // Arrange
    vi.mocked(client.getWars).mockResolvedValue(pageResponse([]))

    // Act
    renderHook(() => useWarListPage({ creatorMe: true }))
    await waitFor(() => expect(client.getWars).toHaveBeenCalled())

    // Assert
    expect(client.getWars).toHaveBeenCalledWith({ sort: 'newest', limit: '10', creator: 'me' })
  })

  it('changing sort resets to page 1 and fetches with the new sort and no cursor', async () => {
    // Arrange
    vi.mocked(client.getWars).mockResolvedValueOnce(pageResponse([buildWarSummary({ id: 'w1' })], 'cursor-1'))
    const { result } = renderHook(() => useWarListPage())
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))
    vi.mocked(client.getWars).mockResolvedValueOnce(pageResponse([buildWarSummary({ id: 'w2' })]))

    // Act
    act(() => result.current.setSort('oldest'))
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'loaded' }))

    // Assert
    expect(client.getWars).toHaveBeenLastCalledWith({ sort: 'oldest', limit: '10' })
    expect(result.current.hasPrev).toBe(false)
  })

  it('fetches with q once the debounced search text settles', async () => {
    // Arrange
    vi.mocked(client.getWars).mockResolvedValue(pageResponse([]))
    const { result } = renderHook(() => useWarListPage())
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))
    const callsBeforeTyping = vi.mocked(client.getWars).mock.calls.length

    // Act
    act(() => result.current.setSearchText('pastry'))

    // Assert — not fetched immediately (still debouncing)
    expect(vi.mocked(client.getWars).mock.calls.length).toBe(callsBeforeTyping)

    // Assert — fetched with q once the debounce elapses
    await waitFor(() => expect(client.getWars).toHaveBeenLastCalledWith({ sort: 'newest', limit: '10', q: 'pastry' }), {
      timeout: 2000,
    })
  })

  it('Next fetches the next page using the previous page\'s next_cursor', async () => {
    // Arrange
    const firstPage = pageResponse([buildWarSummary({ id: 'w1' })], 'cursor-abc')
    const secondPage = pageResponse([buildWarSummary({ id: 'w2' })], null)
    vi.mocked(client.getWars).mockResolvedValueOnce(firstPage)
    const { result } = renderHook(() => useWarListPage())
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))
    expect(result.current.hasNext).toBe(true)
    vi.mocked(client.getWars).mockResolvedValueOnce(secondPage)

    // Act
    act(() => result.current.goNext())
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'loaded', wars: secondPage.wars }))

    // Assert
    expect(client.getWars).toHaveBeenLastCalledWith({ sort: 'newest', limit: '10', cursor: 'cursor-abc' })
    expect(result.current.hasNext).toBe(false)
    expect(result.current.hasPrev).toBe(true)
  })

  it('Prev after Next shows the cached first page without issuing a new request', async () => {
    // Arrange
    const firstPage = pageResponse([buildWarSummary({ id: 'w1' })], 'cursor-abc')
    const secondPage = pageResponse([buildWarSummary({ id: 'w2' })], null)
    vi.mocked(client.getWars).mockResolvedValueOnce(firstPage)
    const { result } = renderHook(() => useWarListPage())
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))
    vi.mocked(client.getWars).mockResolvedValueOnce(secondPage)
    act(() => result.current.goNext())
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'loaded', wars: secondPage.wars }))
    const callCountAfterNext = vi.mocked(client.getWars).mock.calls.length

    // Act
    act(() => result.current.goPrev())

    // Assert
    expect(result.current.state).toMatchObject({ status: 'loaded', wars: firstPage.wars })
    expect(vi.mocked(client.getWars).mock.calls.length).toBe(callCountAfterNext)
    expect(result.current.hasPrev).toBe(false)
    expect(result.current.hasNext).toBe(true)
  })

  it('goNext is a no-op when the current page has no next_cursor', async () => {
    // Arrange
    vi.mocked(client.getWars).mockResolvedValueOnce(pageResponse([buildWarSummary({ id: 'w1' })], null))
    const { result } = renderHook(() => useWarListPage())
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))
    const callCountBefore = vi.mocked(client.getWars).mock.calls.length

    // Act
    act(() => result.current.goNext())

    // Assert
    expect(vi.mocked(client.getWars).mock.calls.length).toBe(callCountBefore)
  })

  it('discards a response that resolves after a newer request has already been issued', async () => {
    // Arrange — the first ("newest") request is left pending; a sort
    // change issues a second request that resolves first.
    let resolveFirst: ((value: ReturnType<typeof pageResponse>) => void) | undefined
    const firstRequest = new Promise<ReturnType<typeof pageResponse>>((resolve) => {
      resolveFirst = resolve
    })
    vi.mocked(client.getWars).mockReturnValueOnce(firstRequest)
    const { result } = renderHook(() => useWarListPage())
    await waitFor(() => expect(client.getWars).toHaveBeenCalledTimes(1))

    const secondPage = pageResponse([buildWarSummary({ id: 'second' })])
    vi.mocked(client.getWars).mockResolvedValueOnce(secondPage)

    // Act — issue the newer (second) request and let it resolve first.
    act(() => result.current.setSort('oldest'))
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'loaded', wars: secondPage.wars }))

    // Act — now let the stale first request resolve, late.
    await act(async () => {
      resolveFirst?.(pageResponse([buildWarSummary({ id: 'stale' })]))
      await Promise.resolve()
    })

    // Assert — the stale response must not have overwritten the newer state.
    expect(result.current.state).toMatchObject({ status: 'loaded', wars: secondPage.wars })
  })

  it('surfaces a user-facing error message when the fetch fails', async () => {
    // Arrange
    vi.mocked(client.getWars).mockRejectedValueOnce(new Error('boom'))

    // Act
    const { result } = renderHook(() => useWarListPage())

    // Assert
    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })
})
