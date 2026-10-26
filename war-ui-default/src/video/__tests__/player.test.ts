import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildVideoMediaItem } from '../../mocks/fixtures'
import { AutoplayBlockedError, createVideoPlayer, type VideoMedia } from '../player'

afterEach(() => {
  vi.useRealTimers()
  delete window.YT
  delete window.Vimeo
  vi.restoreAllMocks()
})

describe('video player allow-list', () => {
  it('rejects a malicious video identifier before creating a provider player', async () => {
    // Arrange
    const host = document.createElement('div')
    const media = buildVideoMediaItem({ id: 'video-1', provider: 'youtube', video_id: 'abc?origin=evil.test' }) as VideoMedia
    const events = { ended: vi.fn(), unavailable: vi.fn() }

    // Act
    const player = createVideoPlayer(host, media, events)

    // Assert
    await expect(player).rejects.toThrow('Invalid video identifier')
    expect(host.childElementCount).toBe(0)
  })
})

describe('YouTube playback', () => {
  it('embeds the no-cookie player origin from a validated id', async () => {
    // Arrange
    window.YT = { Player: class {
      playVideo = vi.fn()
      pauseVideo = vi.fn()
      getCurrentTime = () => 0
      seekTo = vi.fn()
      destroy = vi.fn()
    } }
    const host = document.createElement('div')
    const media = buildVideoMediaItem({ id: 'video-1', provider: 'youtube', video_id: 'abc123' }) as VideoMedia

    // Act
    await createVideoPlayer(host, media, { ended: vi.fn(), unavailable: vi.fn() })

    // Assert
    expect(host.querySelector('iframe')?.src).toContain('https://www.youtube-nocookie.com/embed/abc123?')
  })

  it('waits for readiness and confirms playback before resolving play', async () => {
    // Arrange
    const playVideo = vi.fn()
    let ready: (() => void) | undefined
    let stateChange: ((event: { data: number }) => void) | undefined
    window.YT = { Player: class {
      constructor(_host: HTMLElement, options: object) {
        const events = (options as { events: { onReady(): void; onStateChange(event: { data: number }): void } }).events
        ready = events.onReady
        stateChange = events.onStateChange
      }
      playVideo = playVideo
      pauseVideo = vi.fn()
      getCurrentTime = () => 0
      seekTo = vi.fn()
      destroy = vi.fn()
    } }
    const media = buildVideoMediaItem({ id: 'video-1', provider: 'youtube', video_id: 'abc123' }) as VideoMedia
    const player = await createVideoPlayer(document.createElement('div'), media, { ended: vi.fn(), unavailable: vi.fn() })

    // Act
    const playing = player.play()

    // Assert
    expect(playVideo).not.toHaveBeenCalled()
    ready?.()
    await vi.waitFor(() => expect(playVideo).toHaveBeenCalledOnce())
    stateChange?.({ data: 1 })
    await expect(playing).resolves.toBeUndefined()
  })

  it('offers a retry when the provider blocks autoplay', async () => {
    // Arrange
    let ready: (() => void) | undefined
    let blocked: (() => void) | undefined
    const seekTo = vi.fn()
    window.YT = { Player: class {
      constructor(_host: HTMLElement, options: object) {
        const events = (options as { events: { onReady(): void; onAutoplayBlocked(): void } }).events
        ready = events.onReady
        blocked = events.onAutoplayBlocked
      }
      playVideo = vi.fn()
      pauseVideo = vi.fn()
      getCurrentTime = () => 0
      seekTo = seekTo
      destroy = vi.fn()
    } }
    const media = buildVideoMediaItem({ id: 'video-1', provider: 'youtube', video_id: 'abc123', start_seconds: 5 }) as VideoMedia
    const player = await createVideoPlayer(document.createElement('div'), media, { ended: vi.fn(), unavailable: vi.fn() })

    // Act
    const playing = player.play()
    ready?.()
    await vi.waitFor(() => expect(seekTo).toHaveBeenCalledOnce())
    blocked?.()

    // Assert
    await expect(playing).rejects.toThrow('Autoplay blocked')
    expect(seekTo).toHaveBeenCalledWith(5, true)
  })

  it('fails when the provider never becomes ready', async () => {
    // Arrange
    vi.useFakeTimers()
    window.YT = { Player: class {
      playVideo = vi.fn()
      pauseVideo = vi.fn()
      getCurrentTime = () => 0
      seekTo = vi.fn()
      destroy = vi.fn()
    } }
    const media = buildVideoMediaItem({ id: 'video-1', provider: 'youtube', video_id: 'abc123' }) as VideoMedia
    const player = await createVideoPlayer(document.createElement('div'), media, { ended: vi.fn(), unavailable: vi.fn() })

    // Act
    const playing = player.play()
    const result = expect(playing).rejects.toThrow('Video player timed out')
    await vi.advanceTimersByTimeAsync(10000)

    // Assert
    await result
  })

  it('stops at the clip end even after seeking on replay', async () => {
    // Arrange
    vi.useFakeTimers()
    let ready: (() => void) | undefined
    let stateChange: ((event: { data: number }) => void) | undefined
    const pauseVideo = vi.fn()
    window.YT = { Player: class {
      constructor(_host: HTMLElement, options: object) {
        const events = (options as { events: { onReady(): void; onStateChange(event: { data: number }): void } }).events
        ready = events.onReady
        stateChange = events.onStateChange
      }
      playVideo = vi.fn()
      pauseVideo = pauseVideo
      getCurrentTime = () => 15
      seekTo = vi.fn()
      destroy = vi.fn()
    } }
    const media = buildVideoMediaItem({ id: 'video-1', provider: 'youtube', video_id: 'abc123', start_seconds: 5, end_seconds: 12 }) as VideoMedia
    const ended = vi.fn()
    const player = await createVideoPlayer(document.createElement('div'), media, { ended, unavailable: vi.fn() })

    // Act
    const playing = player.play()
    ready?.()
    await vi.advanceTimersByTimeAsync(0)
    stateChange?.({ data: 1 })
    await playing
    await vi.advanceTimersByTimeAsync(300)

    // Assert
    expect(pauseVideo).toHaveBeenCalledOnce()
    expect(ended).toHaveBeenCalledOnce()
  })
})

describe('Vimeo clip playback', () => {
  it('pauses at the clip end and emits ended once', async () => {
    // Arrange
    const callbacks = new Map<string, (event: { seconds: number }) => void>()
    const pause = vi.fn().mockResolvedValue(undefined)
    window.Vimeo = { Player: class {
      on(event: string, callback: (...args: never[]) => void) { callbacks.set(event, callback as (event: { seconds: number }) => void) }
      play = vi.fn().mockResolvedValue(undefined)
      pause = pause
      setCurrentTime = vi.fn().mockResolvedValue(3)
      destroy = vi.fn().mockResolvedValue(undefined)
    } }
    const media = buildVideoMediaItem({ id: 'video-1', provider: 'vimeo', video_id: '12345', start_seconds: 3, end_seconds: 5 }) as VideoMedia
    const ended = vi.fn()
    const player = await createVideoPlayer(document.createElement('div'), media, { ended, unavailable: vi.fn() })

    // Act
    await player.play()
    callbacks.get('timeupdate')?.({ seconds: 5 })
    callbacks.get('timeupdate')?.({ seconds: 6 })

    // Assert
    expect(pause).toHaveBeenCalledOnce()
    expect(ended).toHaveBeenCalledOnce()
  })

  it('embeds only the allowed Vimeo player origin', async () => {
    // Arrange
    window.Vimeo = { Player: class {
      on = vi.fn()
      play = vi.fn().mockResolvedValue(undefined)
      pause = vi.fn().mockResolvedValue(undefined)
      setCurrentTime = vi.fn().mockResolvedValue(0)
      destroy = vi.fn().mockResolvedValue(undefined)
    } }
    const host = document.createElement('div')
    const media = buildVideoMediaItem({ id: 'video-1', provider: 'vimeo', video_id: '12345' }) as VideoMedia

    // Act
    await createVideoPlayer(host, media, { ended: vi.fn(), unavailable: vi.fn() })

    // Assert
    expect(host.querySelector('iframe')?.src).toBe('https://player.vimeo.com/video/12345')
  })

  it('maps a Vimeo autoplay refusal to a manual retry', async () => {
    // Arrange
    window.Vimeo = { Player: class {
      on = vi.fn()
      play = vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
      pause = vi.fn().mockResolvedValue(undefined)
      setCurrentTime = vi.fn().mockResolvedValue(0)
      destroy = vi.fn().mockResolvedValue(undefined)
    } }
    const media = buildVideoMediaItem({ id: 'video-1', provider: 'vimeo', video_id: '12345' }) as VideoMedia
    const player = await createVideoPlayer(document.createElement('div'), media, { ended: vi.fn(), unavailable: vi.fn() })

    // Act
    const playing = player.play()

    // Assert
    await expect(playing).rejects.toBeInstanceOf(AutoplayBlockedError)
  })
})
