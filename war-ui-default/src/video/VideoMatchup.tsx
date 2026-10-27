import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import type { NextMatchupResponse } from '../api/client'
import { MatchupView } from '../components/MatchupView'
import { AutoplayBlockedError, createVideoPlayer, VideoUnavailableError, type VideoMedia, type VideoPlayer } from './player'
import { videoDebug } from './debugLog'
import { VideoDebugPanel } from './VideoDebugPanel'

type Matchup = NextMatchupResponse['matchup']
type Side = 'left' | 'right'
type PlaybackState = 'poster' | 'playing' | 'played' | 'manual' | 'unavailable'

interface Props {
  matchup: Matchup
  votingInFlight: boolean
  onSelect: (id: string) => void
  progressBar: ReactNode
  errorMessage: ReactNode
}

interface CardProps {
  side: Side
  contestant: Matchup['left']
  media?: VideoMedia
  state: PlaybackState
  votingInFlight: boolean
  playerHost: React.RefObject<HTMLDivElement | null>
  onPosterClick?: () => void
  skipControl?: ReactNode
  onManualPlay: () => void
  onSelect: (id: string) => void
}

function Poster({ media, state, onPosterClick }: Pick<CardProps, 'media' | 'state' | 'onPosterClick'>) {
  if (!media?.poster_url) return null
  const poster = <img data-testid="video-poster" className="video-poster" src={media.poster_url} alt="" hidden={state === 'playing'} />
  if (onPosterClick) return <button type="button" className="video-poster-button" aria-label="Skip to right video" onClick={onPosterClick}>{poster}</button>
  return poster
}

function ManualPlay({ side, state, onManualPlay }: Pick<CardProps, 'side' | 'state' | 'onManualPlay'>) {
  if (state !== 'manual') return null
  return <button type="button" onClick={onManualPlay}>Play {side} video</button>
}

function VoteButton({ contestant, votingInFlight, onSelect }: Pick<CardProps, 'contestant' | 'votingInFlight' | 'onSelect'>) {
  return <button type="button" disabled={votingInFlight} onClick={() => onSelect(contestant.id)}>Vote for {contestant.name}</button>
}

function VideoCard(props: CardProps) {
  const { side, contestant, media, state, votingInFlight, playerHost, onManualPlay, onSelect } = props
  return <div className="contestant-card video-card" data-testid="contestant-card" data-video-state={state} data-selectable={!votingInFlight}>
    <Poster media={media} state={state} onPosterClick={props.onPosterClick} />
    <div ref={playerHost} className="video-player" />
    <p>{contestant.name}</p>
    {state === 'unavailable' && <p role="status">Video unavailable</p>}
    {props.skipControl}
    <ManualPlay side={side} state={state} onManualPlay={onManualPlay} />
    <VoteButton contestant={contestant} votingInFlight={votingInFlight} onSelect={onSelect} />
  </div>
}

function stateForPlaybackError(error: unknown): PlaybackState {
  return error instanceof AutoplayBlockedError ? 'manual' : 'unavailable'
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
  const disposed = useRef(false)
  const generations = useRef({ left: 0, right: 0 })
  const advancedLeft = useRef(-1)
  const [rightStarted, setRightStarted] = useState(false)
  const media = { left: matchup.left.media[0] as VideoMedia | undefined, right: matchup.right.media[0] as VideoMedia | undefined }

  // The parent remounts this component for each matchup, so these run once per matchup.
  const autoplay = useEffectEvent(() => {
    videoDebug(`matchup ${matchup.id} on ${navigator.userAgent}`)
    disposed.current = false
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
      ended: () => { if (isCurrent(side, generation)) handleEnded(side, set) },
      unavailable: () => { if (isCurrent(side, generation)) playbackFailed(side, set, new VideoUnavailableError('Video unavailable')) },
    }
  }

  async function start(side: Side, generation: number, host: HTMLDivElement, set: (state: PlaybackState) => void) {
    const item = media[side]
    if (!item) throw new VideoUnavailableError('Video unavailable')
    set('playing')
    if (!players.current[side]) {
      const created = await createVideoPlayer(host, item, playerEvents(side, generation, set))
      if (!isCurrent(side, generation)) { created.destroy(); return }
      players.current[side] = created
    }
    await players.current[side].play()
  }

  async function play(side: Side) {
    const [host, set] = side === 'left' ? [leftHost.current, setLeft] : [rightHost.current, setRight]
    if (!host) return
    const generation = generations.current[side]
    try {
      await start(side, generation, host, set)
      markStarted(side, generation)
    } catch (error) {
      if (isCurrent(side, generation)) playbackFailed(side, set, error)
    }
  }

  function playbackFailed(side: Side, set: (state: PlaybackState) => void, error: unknown) {
    const state = stateForPlaybackError(error)
    videoDebug(`${side} failed: ${error instanceof Error ? error.message : String(error)}`)
    set(state)
    if (side === 'left' && state === 'unavailable') beginRight()
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
    stop('left')
    stop('right')
    setRight(initialState(media.right))
    void play('left')
  }

  function skipLeft() {
    stop('left')
    setLeft('played')
    beginRight()
  }

  function handleEnded(side: Side, set: (state: PlaybackState) => void) {
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
      left: <VideoCard side="left" contestant={matchup.left} media={media.left} state={left} skipControl={left === 'playing' && <button type="button" onClick={skipLeft}>Next video {'\u203a'}</button>} votingInFlight={votingInFlight} playerHost={leftHost} onManualPlay={() => void play('left')} onSelect={select} />,
      right: <VideoCard side="right" contestant={matchup.right} media={media.right} state={right} onPosterClick={left === 'playing' ? skipLeft : undefined} votingInFlight={votingInFlight} playerHost={rightHost} onManualPlay={() => void play('right')} onSelect={select} />,
    }}
    playbackControl={<div className="video-controls">
      <VideoDebugPanel />
      {rightStarted && <button type="button" onClick={replay}>Replay videos</button>}
    </div>}
  />
}
