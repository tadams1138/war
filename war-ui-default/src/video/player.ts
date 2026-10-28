import type { MediaItem } from '../api/client'
import { videoDebug } from './debugLog'

export type VideoMedia = MediaItem & {
  provider: 'youtube' | 'vimeo'
  video_id: string
  start_seconds: number
  end_seconds: number | null
  duration_seconds: number
  poster_url: string | null
}

export interface VideoPlayer {
  play(): Promise<void>
  pause(): void
  destroy(): void
}

function validVideo(media: VideoMedia): boolean {
  if (media.provider === 'youtube') return /^[A-Za-z0-9_-]+$/.test(media.video_id)
  if (media.provider === 'vimeo') return /^[0-9]+$/.test(media.video_id)
  return false
}

interface PlayerEvents {
  playing(): void
  ended(): void
  unavailable(): void
}

export class AutoplayBlockedError extends Error {}
export class VideoUnavailableError extends Error {}

interface YouTubePlayer {
  getPlaybackQuality?(): string
  playVideo(): void
  pauseVideo(): void
  getCurrentTime(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  destroy(): void
}

interface VimeoPlayer {
  play(): Promise<void>
  pause(): Promise<void>
  setCurrentTime(seconds: number): Promise<number>
  on(event: string, callback: (...args: never[]) => void): void
  destroy(): Promise<void>
}

declare global {
  interface Window {
    YT?: { Player: new (host: HTMLElement, options: object) => YouTubePlayer }
    onYouTubeIframeAPIReady?: () => void
    Vimeo?: { Player: new (host: HTMLElement, options?: object) => VimeoPlayer }
  }
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.onload = () => resolve()
    script.onerror = () => reject(new VideoUnavailableError('Video player unavailable'))
    document.head.append(script)
  })
}

let youTubeReady: Promise<void> | undefined
let vimeoReady: Promise<void> | undefined

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new VideoUnavailableError('Video player timed out')), 8000)
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value) },
      (error: unknown) => { window.clearTimeout(timer); reject(error) },
    )
  })
}

function isAutoplayRefusal(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotAllowedError'
}

function ensureYouTube(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  youTubeReady ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve
    void loadScript('https://www.youtube.com/iframe_api').catch(reject)
  })
  return youTubeReady
}

function ensureVimeo(): Promise<void> {
  if (window.Vimeo?.Player) return Promise.resolve()
  vimeoReady ??= loadScript('https://player.vimeo.com/api/player.js')
  return vimeoReady
}

async function createYouTube(host: HTMLElement, media: VideoMedia, events: PlayerEvents): Promise<VideoPlayer> {
  await withTimeout(ensureYouTube())
  const url = new URL(`https://www.youtube-nocookie.com/embed/${media.video_id}`)
  url.searchParams.set('enablejsapi', '1')
  url.searchParams.set('origin', window.location.origin)
  url.searchParams.set('start', String(media.start_seconds))
  if (media.end_seconds !== null) url.searchParams.set('end', String(media.end_seconds))
  const iframe = document.createElement('iframe')
  iframe.src = url.toString()
  iframe.allow = 'autoplay; fullscreen; picture-in-picture'
  iframe.title = 'YouTube video player'
  host.append(iframe)
  let ready!: () => void
  const readyPromise = new Promise<void>((resolve) => { ready = resolve })
  let resolvePlay: (() => void) | undefined
  let rejectPlay: ((reason: Error) => void) | undefined
  let ended = false
  let clipTimer: number | undefined
  function finish() {
    if (ended) return
    ended = true
    window.clearInterval(clipTimer)
    events.ended()
  }
  function checkClipEnd() {
    if (media.end_seconds === null || player.getCurrentTime() < media.end_seconds) return
    videoDebug(`${label} clip end reached at ${at()}s`)
    player.pauseVideo()
    finish()
  }
  const label = `youtube ${media.video_id}`
  const stateNames: Record<number, string> = { [-1]: 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' }
  const at = () => { try { return player.getCurrentTime().toFixed(1) } catch { return '?' } }
  const logState = (data: number) => videoDebug(`${label} ${stateNames[data] ?? data} at ${at()}s`)
  function handleState(data: number) {
    logState(data)
    if (data === 1) {
      ended = false
      events.playing()
      resolvePlay?.()
      if (media.end_seconds !== null) {
        window.clearInterval(clipTimer)
        clipTimer = window.setInterval(checkClipEnd, 250)
      }
    }
    if (data === 0) finish()
  }
  const player = new window.YT!.Player(iframe, {
    events: {
      onReady: () => { videoDebug(`${label} ready`); ready() },
      onStateChange: (event: { data: number }) => handleState(event.data),
      onPlaybackQualityChange: (event: { data: string }) => videoDebug(`${label} quality ${event.data} at ${at()}s`),
      onAutoplayBlocked: () => { videoDebug(`${label} autoplay blocked`); rejectPlay?.(new AutoplayBlockedError('Autoplay blocked')) },
      onError: (event?: { data: number }) => { videoDebug(`${label} error ${event?.data}`); events.unavailable(); rejectPlay?.(new VideoUnavailableError('Video unavailable')) },
    },
  })
  return {
    play: async () => {
      await withTimeout(readyPromise)
      ended = false
      window.clearInterval(clipTimer)
      videoDebug(`${label} seekTo ${media.start_seconds} and playVideo`)
      player.seekTo(media.start_seconds, true)
      return withTimeout(new Promise<void>((resolve, reject) => {
        resolvePlay = resolve
        rejectPlay = reject
        player.playVideo()
      }))
    },
    pause: () => { videoDebug(`${label} pause requested`); window.clearInterval(clipTimer); player.pauseVideo() },
    destroy: () => { window.clearInterval(clipTimer); player.destroy(); iframe.remove() },
  }
}

async function createVimeo(host: HTMLElement, media: VideoMedia, events: PlayerEvents): Promise<VideoPlayer> {
  await withTimeout(ensureVimeo())
  const iframe = document.createElement('iframe')
  iframe.src = `https://player.vimeo.com/video/${media.video_id}`
  iframe.allow = 'autoplay; fullscreen; picture-in-picture'
  iframe.title = 'Vimeo video player'
  host.append(iframe)
  const player = new window.Vimeo!.Player(iframe)
  await withTimeout(player.setCurrentTime(media.start_seconds))
  let ended = false
  function finish() {
    if (ended) return
    ended = true
    void player.pause()
    events.ended()
  }
  const label = `vimeo ${media.video_id}`
  for (const name of ['pause', 'bufferstart', 'bufferend', 'ended']) player.on(name, () => videoDebug(`${label} ${name}`))
  player.on('play', () => { ended = false; videoDebug(`${label} playing (provider event)`); events.playing() })
  player.on('ended', finish)
  player.on('error', (error: unknown) => { videoDebug(`${label} error ${String((error as { name?: string }).name)}`); events.unavailable() })
  player.on('timeupdate', (event: { seconds: number }) => {
    if (media.end_seconds !== null && event.seconds >= media.end_seconds) finish()
  })
  return {
    play: async () => {
      ended = false
      await withTimeout(player.setCurrentTime(media.start_seconds))
      videoDebug(`${label} play`)
      try {
        await withTimeout(player.play())
      } catch (error) {
        videoDebug(`${label} play refused ${String((error as { name?: string }).name)}`)
        if (isAutoplayRefusal(error)) throw new AutoplayBlockedError('Autoplay blocked')
        throw error
      }
    },
    pause: () => { videoDebug(`${label} pause requested`); void player.pause().catch((error: unknown) => videoDebug(`${label} pause failed ${String(error)}`)) },
    destroy: () => { void player.destroy(); iframe.remove() },
  }
}

export async function createVideoPlayer(host: HTMLElement, media: VideoMedia, events: PlayerEvents): Promise<VideoPlayer> {
  if (!validVideo(media)) throw new Error('Invalid video identifier')
  if (media.provider === 'youtube') return createYouTube(host, media, events)
  if (media.provider === 'vimeo') return createVimeo(host, media, events)
  throw new Error('Unsupported video provider')
}
