import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import type { NextMatchupResponse } from '../api/client'
import { MatchupView } from '../components/MatchupView'
import { AutoplayBlockedError, createVideoPlayer, VideoUnavailableError, type VideoMedia, type VideoPlayer } from './player'
import { videoDebug } from './debugLog'
import { VideoDebugPanel } from './VideoDebugPanel'

type Matchup = NextMatchupResponse['matchup']
type Side = 'left' | 'right'
type PlaybackState = 'poster' | 'playing' | 'played' | 'waiting' | 'unavailable'

interface Props {
  matchup: Matchup
  votingInFlight: boolean
  onSelect: (id: string) => void
  progressBar: ReactNode
  errorMessage: ReactNode
}

interface CardProps {
  contestant: Matchup['left']
  media?: VideoMedia
  state: PlaybackState
  hasPlayer: boolean
  votingInFlight: boolean
  playerHost: React.RefObject<HTMLDivElement | null>
  onSelect: (id: string) => void
}

// One box per card: the provider's player while one exists, the poster otherwise.
function Poster({ media, hasPlayer }: Pick<CardProps, 'media' | 'hasPlayer'>) {
  if (!media?.poster_url) return null
  return <img data-testid="video-poster" className="video-poster" src={media.poster_url} alt="" hidden={hasPlayer} />
}

function VoteButton({ contestant, votingInFlight, onSelect }: Pick<CardProps, 'contestant' | 'votingInFlight' | 'onSelect'>) {
  return <button type="button" disabled={votingInFlight} onClick={() => onSelect(contestant.id)}>Vote for {contestant.name}</button>
}

function VideoCard(props: CardProps) {
  const { contestant, media, state, hasPlayer, votingInFlight, playerHost, onSelect } = props
  return <div className="contestant-card video-card" data-testid="contestant-card" data-video-state={state} data-selectable={!votingInFlight}>
    <Poster media={media} hasPlayer={hasPlayer} />
    <div ref={playerHost} className="video-player" hidden={!hasPlayer} />
    {state === 'unavailable' && <p role="status">Video unavailable</p>}
    <VoteButton contestant={contestant} votingInFlight={votingInFlight} onSelect={onSelect} />
  </div>
}

function stateForPlaybackError(error: unknown): PlaybackState {
  return error instanceof AutoplayBlockedError ? 'waiting' : 'unavailable'
}

function initialState(media: VideoMedia | undefined): PlaybackState {
  return media ? 'poster' : 'unavailable'
}

export function VideoMatchup(props: Props) {
  const { matchup, votingInFlight, onSelect, progressBar, errorMessage } = props
  const [left, setLeft] = useState<PlaybackState>(initialState(matchup.left.media[0] as VideoMedia | undefined))
  const [right, setRight] = useState<PlaybackState>(initialState(matchup.right.media[0] as VideoMedia | undefined))
  const leftHost = useRef<HTMLDivElement>(null)
  const rightHost = useRef<HTMLDivElement>(null)
  const players = useRef<Partial<Record<Side, VideoPlayer>>>({})
  const creating = useRef<Partial<Record<Side, Promise<VideoPlayer | undefined>>>>({})
  const disposed = useRef(false)
  const active = useRef<Side | undefined>(undefined)
  const generations = useRef({ left: 0, right: 0 })
  const advancedLeft = useRef(-1)
  const [rightStarted, setRightStarted] = useState(false)
  const [hasPlayer, setHasPlayer] = useState<Record<Side, boolean>>({ left: false, right: false })
  const showPlayer = (side: Side, shown: boolean) => setHasPlayer((current) => ({ ...current, [side]: shown }))
  const media = { left: matchup.left.media[0] as VideoMedia | undefined, right: matchup.right.media[0] as VideoMedia | undefined }

  // The parent remounts this component for each matchup, so these run once per matchup.
  const autoplay = useEffectEvent(() => {
    videoDebug(`matchup ${matchup.id} on ${navigator.userAgent}`)
    disposed.current = false
    const generation = generations.current.right
    void prepare('right', generation, rightHost.current!, setRight).catch((error: unknown) => {
      if (isCurrent('right', generation)) playbackFailed('right', setRight, error)
    })
    void play('left')
  })
  const dispose = useEffectEvent(() => {
    disposed.current = true
    stop('left')
    stop('right')
  })

  useEffect(() => { videoDebug(`left state ${left}`) }, [left])
  useEffect(() => { videoDebug(`right state ${right}`) }, [right])

  useEffect(() => {
    autoplay()
    return () => dispose()
  }, [])

  function stop(side: Side) {
    generations.current[side] += 1
    players.current[side]?.destroy()
    delete players.current[side]
    delete creating.current[side]
    if (active.current === side) active.current = undefined
    showPlayer(side, false)
  }

  function select(id: string) {
    stop('left')
    stop('right')
    setLeft((state) => state === 'playing' ? 'played' : state)
    setRight((state) => state === 'playing' ? 'played' : state)
    onSelect(id)
  }

  function isCurrent(side: Side, generation: number) {
    return !disposed.current && generations.current[side] === generation
  }

  function playerEvents(side: Side, generation: number, set: (state: PlaybackState) => void) {
    return {
      playing: () => { if (isCurrent(side, generation)) handlePlaying(side, generation, set) },
      ended: () => { if (isCurrent(side, generation)) handleEnded(side, set) },
      unavailable: () => { if (isCurrent(side, generation)) playbackFailed(side, set, new VideoUnavailableError('Video unavailable')) },
    }
  }

  async function create(side: Side, generation: number, host: HTMLDivElement, set: (state: PlaybackState) => void) {
    const item = media[side]
    if (!item) throw new VideoUnavailableError('Video unavailable')
    videoDebug(`${side} creating cued player`)
    showPlayer(side, true)
    const created = await createVideoPlayer(host, item, playerEvents(side, generation, set))
    if (!isCurrent(side, generation)) { created.destroy(); return }
    players.current[side] = created
    return created
  }

  function prepare(side: Side, generation: number, host: HTMLDivElement, set: (state: PlaybackState) => void) {
    creating.current[side] ??= create(side, generation, host, set)
    return creating.current[side]
  }

  async function play(side: Side) {
    const [host, set] = side === 'left' ? [leftHost.current, setLeft] : [rightHost.current, setRight]
    const generation = generations.current[side]
    try {
      const player = await prepare(side, generation, host!, set)
      if (!isCurrent(side, generation)) return
      await player!.play()
    } catch (error) {
      if (isCurrent(side, generation)) playbackFailed(side, set, error)
    }
  }

  function playbackFailed(side: Side, set: (state: PlaybackState) => void, error: unknown) {
    const state = stateForPlaybackError(error)
    if (!players.current[side]) showPlayer(side, false)
    videoDebug(`${side} failed: ${error instanceof Error ? error.message : String(error)}`)
    set(state)
    if (side === 'left' && state === 'unavailable') beginRight()
  }

  function pause(side: Side) {
    if (active.current !== side) return
    videoDebug(`${side} pause requested by matchup`)
    players.current[side]?.pause()
    active.current = undefined
    const set = side === 'left' ? setLeft : setRight
    set('played')
  }

  function handlePlaying(side: Side, generation: number, set: (state: PlaybackState) => void) {
    videoDebug(`${side} provider reported playing`)
    pause(side === 'left' ? 'right' : 'left')
    active.current = side
    if (side === 'left') advancedLeft.current = -1
    set('playing')
    markStarted(side, generation)
  }

  function markStarted(side: Side, generation: number) {
    if (side === 'right' && isCurrent(side, generation)) setRightStarted(true)
  }

  function beginRight() {
    if (advancedLeft.current === generations.current.left) return
    advancedLeft.current = generations.current.left
    void play('right')
  }

  function replay() {
    videoDebug('replay requested')
    pause('right')
    advancedLeft.current = -1
    void play('left')
  }

  function handleEnded(side: Side, set: (state: PlaybackState) => void) {
    if (active.current === side) active.current = undefined
    set('played')
    if (side === 'left') beginRight()
  }

  return <MatchupView
    matchup={matchup}
    votingInFlight={votingInFlight}
    onSelect={select}
    progressBar={progressBar}
    errorMessage={errorMessage}
    videoCards={{
      left: <VideoCard contestant={matchup.left} media={media.left} state={left} hasPlayer={hasPlayer.left} votingInFlight={votingInFlight} playerHost={leftHost} onSelect={select} />,
      right: <VideoCard contestant={matchup.right} media={media.right} state={right} hasPlayer={hasPlayer.right} votingInFlight={votingInFlight} playerHost={rightHost} onSelect={select} />,
    }}
    playbackControl={<div className="video-controls">
      <VideoDebugPanel />
      {rightStarted && <button type="button" onClick={replay}>Replay videos</button>}
    </div>}
  />
}
