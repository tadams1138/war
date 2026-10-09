// A contestant's images, paged by swipe, arrow keys or arrow buttons
// (war-spec.md §10.3, §10.4). When `onTap` is given (the vote page), a tap
// or Enter/Space activates it. Swipe and tap must never be confused:
// ambiguity always resolves toward "swipe", since a mis-fired vote is
// unrecoverable (votes are final). Styling lives in layout.css (.carousel-*).
import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { MediaItem } from '../api/client'
import { byDisplayOrder, srcSetFor } from '../utils/media'
import { exceedsSwipeThreshold, swipeDirection } from '../utils/swipe'

interface ImageCarouselProps {
  media: MediaItem[]
  disabled?: boolean
  // Omitted for browse-only carousels (the results list).
  onTap?: () => void
  // Extra content (the contestant's name) rendered inside the same
  // gesture-handling element: the whole card is one tap/swipe target and a
  // single tab stop (war-spec.md §10.3), not just the image.
  children?: ReactNode
  ariaLabel?: string
  // The vote page's cards: media fills the vertical space the layout gives
  // it rather than sizing from the image's own aspect ratio.
  fillHeight?: boolean
}

const VOTE_LABEL = 'Contestant photo — swipe to browse, tap to vote'
const BROWSE_LABEL = 'Contestant photo — swipe to browse'

// Reserves the image's own aspect ratio so a list doesn't reflow as images
// load; unused with `fillHeight`, where the layout sizes the frame.
function frameStyle(item: MediaItem, fillHeight: boolean | undefined): CSSProperties | undefined {
  if (fillHeight) return undefined
  return { aspectRatio: item.aspect_ratio ?? undefined, minHeight: item.aspect_ratio ? undefined : '12rem' }
}

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'previous' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  // Pointer events are stopped too, not just click: they bubble to the
  // carousel's tap gesture handlers before click fires, so stopping click
  // alone let a mouse click here cast a vote underneath the navigation.
  return (
    <button
      type="button"
      className={`carousel-arrow carousel-arrow--${direction}`}
      data-testid={`carousel-arrow-${direction}`}
      aria-label={direction === 'previous' ? 'Previous image' : 'Next image'}
      tabIndex={-1}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {direction === 'previous' ? '‹' : '›'}
    </button>
  )
}

type KeyAction = 'previous' | 'next' | 'activate'

function keyAction(key: string): KeyAction | null {
  if (key === 'ArrowLeft') return 'previous'
  if (key === 'ArrowRight') return 'next'
  return isActivationKey(key) ? 'activate' : null
}

function useCarouselPaging(count: number) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]))

  function navigate(direction: 'next' | 'previous') {
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
    const clamped = Math.max(0, Math.min(count - 1, nextIndex))
    setCurrentIndex(clamped)
    setVisited((prev) => new Set(prev).add(clamped))
  }

  return { currentIndex, visited, navigate }
}

// Pointer handlers that tell a swipe (page) from a tap (activate).
function useSwipeOrTap(onSwipe: (direction: 'next' | 'previous') => void, onTap: (() => void) | undefined) {
  const gesture = useRef<{ startX: number; isSwiping: boolean } | null>(null)

  return {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      gesture.current = { startX: event.clientX, isSwiping: false }
    },
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      if (gesture.current && exceedsSwipeThreshold(event.clientX - gesture.current.startX)) {
        gesture.current.isSwiping = true
      }
    },
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
      const current = gesture.current
      gesture.current = null
      if (!current) return
      if (!current.isSwiping) return onTap?.()
      const direction = swipeDirection(event.clientX - current.startX)
      if (direction) onSwipe(direction)
    },
  }
}

function carouselClassName(fillHeight: boolean | undefined, tappable: boolean): string {
  return ['carousel', fillHeight && 'carousel--fill', tappable && 'carousel--tappable'].filter(Boolean).join(' ')
}

function carouselLabel(ariaLabel: string | undefined, hasTapAction: boolean): string {
  return ariaLabel ?? (hasTapAction ? VOTE_LABEL : BROWSE_LABEL)
}

function carouselKeyHandler(navigate: (direction: 'next' | 'previous') => void, tap: (() => void) | undefined) {
  return (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const action = keyAction(event.key)
    if (!action) return
    if (action === 'activate') {
      if (!tap) return
      event.preventDefault()
      tap()
      return
    }
    event.preventDefault()
    navigate(action)
  }
}

function CarouselPagingControls({
  count,
  currentIndex,
  onNavigate,
}: {
  count: number
  currentIndex: number
  onNavigate: (direction: 'next' | 'previous') => void
}) {
  if (count < 2) return null
  return (
    <>
      <ArrowButton direction="previous" disabled={currentIndex === 0} onClick={() => onNavigate('previous')} />
      <ArrowButton direction="next" disabled={currentIndex === count - 1} onClick={() => onNavigate('next')} />
      <div className="carousel-dots" data-testid="carousel-dots">
        {Array.from({ length: count }, (_, index) => (
          <span key={index} className="carousel-dot" data-testid="carousel-dot" aria-hidden="true" data-active={index === currentIndex} />
        ))}
      </div>
    </>
  )
}

export function ImageCarousel({ media, disabled, onTap, children, ariaLabel, fillHeight }: ImageCarouselProps) {
  const sorted = byDisplayOrder(media)
  const { currentIndex, visited, navigate } = useCarouselPaging(sorted.length)
  const tap = disabled ? undefined : onTap
  const pointerHandlers = useSwipeOrTap(navigate, tap)

  const handleKeyDown = carouselKeyHandler(navigate, tap)

  return (
    <div
      data-testid="carousel-root"
      className={carouselClassName(fillHeight, tap !== undefined)}
      role="group"
      aria-label={carouselLabel(ariaLabel, onTap !== undefined)}
      tabIndex={0}
      {...pointerHandlers}
      onKeyDown={handleKeyDown}
    >
      <div className="carousel-frames">
        {sorted.map((item, index) => (
          <div key={item.id} className="carousel-frame" data-active={index === currentIndex} style={frameStyle(item, fillHeight)}>
            {visited.has(index) && (
              <img data-testid="carousel-image" alt="" src={item.variants[0]?.url} srcSet={srcSetFor(item)} sizes="50vw" />
            )}
          </div>
        ))}
        <CarouselPagingControls count={sorted.length} currentIndex={currentIndex} onNavigate={navigate} />
      </div>
      {children}
    </div>
  )
}
