import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { NextMatchupResponse } from '../api/client'
import { MatchupView } from '../components/MatchupView'
import { AutoplayBlockedError, createVideoPlayer, VideoUnavailableError, type VideoMedia, type VideoPlayer } from './player'

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
  selectable: boolean
  votingInFlight: boolean
  playerHost: React.RefObject<HTMLDivElement | null>
  onManualPlay: () => void
  onSelect: (id: string) => void
}

function Poster({ media, state }: Pick<CardProps, 'media' | 'state'>) {
  if (state !== 'poster' || !media?.poster_url) return null
  return <img data-testid="video-poster" src={media.poster_url} alt="" />
}

function ManualPlay({ side, state, onManualPlay }: Pick<CardProps, 'side' | 'state' | 'onManualPlay'>) {
  if (state !== 'manual') return null
  return <button type="button" onClick={onManualPlay}>Play {side} video</button>
}

function VoteButton({ contestant, selectable, votingInFlight, onSelect }: Pick<CardProps, 'contestant' | 'selectable' | 'votingInFlight' | 'onSelect'>) {
  if (!selectable) return null
  return <button type="button" disabled={votingInFlight} onClick={() => onSelect(contestant.id)}>Vote for {contestant.name}</button>
}

function VideoCard(props: CardProps) {
  const { side, contestant, media, state, selectable, votingInFlight, playerHost, onManualPlay, onSelect } = props
  return <div className="contestant-card video-card" data-testid="contestant-card" data-video-state={state} data-selectable={selectable && !votingInFlight}>
    <Poster media={media} state={state} />
    <div ref={playerHost} className="video-player" />
    <p>{contestant.name}</p>
    {state === 'unavailable' && <p role="status">Video unavailable</p>}
    <ManualPlay side={side} state={state} onManualPlay={onManualPlay} />
    <VoteButton contestant={contestant} selectable={selectable} votingInFlight={votingInFlight} onSelect={onSelect} />
  </div>
}

function isSelectable(left: PlaybackState, right: PlaybackState): boolean {
  return (left === 'played' && right === 'played') || left === 'unavailable' || right === 'unavailable'
}

function stateForPlaybackError(error: unknown): PlaybackState {
  return error instanceof AutoplayBlockedError ? 'manual' : 'unavailable'
}

function useSelectionUnlock(left: PlaybackState, right: PlaybackState): boolean {
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => {
    if (isSelectable(left, right)) setUnlocked(true)
  }, [left, right])
  return unlocked || isSelectable(left, right)
}

export function VideoMatchup(props: Props) {
  const { matchup, votingInFlight, onSelect, progressBar, errorMessage } = props
  const [left, setLeft] = useState<PlaybackState>(matchup.left.media[0] ? 'poster' : 'unavailable')
  const [right, setRight] = useState<PlaybackState>(matchup.right.media[0] ? 'poster' : 'unavailable')
  const leftHost = useRef<HTMLDivElement>(null)
  const rightHost = useRef<HTMLDivElement>(null)
  const players = useRef<Partial<Record<Side, VideoPlayer>>>({})
  const disposed = useRef(false)
  const media = { left: matchup.left.media[0] as VideoMedia | undefined, right: matchup.right.media[0] as VideoMedia | undefined }
  const selectable = useSelectionUnlock(left, right)

  useEffect(() => {
    disposed.current = false
    return () => {
      disposed.current = true
      players.current.left?.destroy()
      players.current.right?.destroy()
      players.current = {}
    }
  }, [])

  function playerEvents(side: Side, set: (state: PlaybackState) => void) {
    return {
      ended: () => { if (!disposed.current) handleEnded(side, set) },
      unavailable: () => { if (!disposed.current) set('unavailable') },
    }
  }

  async function start(side: Side, host: HTMLDivElement, set: (state: PlaybackState) => void) {
    const item = media[side]
    if (!item) throw new VideoUnavailableError('Video unavailable')
    set('playing')
    if (!players.current[side]) {
      const created = await createVideoPlayer(host, item, playerEvents(side, set))
      if (disposed.current) { created.destroy(); return }
      players.current[side] = created
    }
    await players.current[side].play()
  }

  async function play(side: Side) {
    const [host, set] = side === 'left' ? [leftHost.current, setLeft] : [rightHost.current, setRight]
    if (!host) return
    try {
      await start(side, host, set)
    } catch (error) {
      if (!disposed.current) set(stateForPlaybackError(error))
    }
  }

  function handleEnded(side: Side, set: (state: PlaybackState) => void) {
    set('played')
    if (side === 'left') void play('right')
  }

  return <MatchupView
    matchup={matchup}
    votingInFlight={votingInFlight}
    onSelect={onSelect}
    progressBar={progressBar}
    errorMessage={errorMessage}
    videoCards={{
      left: <VideoCard side="left" contestant={matchup.left} media={media.left} state={left} selectable={selectable} votingInFlight={votingInFlight} playerHost={leftHost} onManualPlay={() => void play('left')} onSelect={onSelect} />,
      right: <VideoCard side="right" contestant={matchup.right} media={media.right} state={right} selectable={selectable} votingInFlight={votingInFlight} playerHost={rightHost} onManualPlay={() => void play('right')} onSelect={onSelect} />,
    }}
    playbackControl={<div className="video-controls">
      {left === 'poster' && <button type="button" onClick={() => void play('left')}>Play both videos</button>}
      {selectable && <button type="button" onClick={() => void play('left')}>Replay videos</button>}
    </div>}
  />
}
