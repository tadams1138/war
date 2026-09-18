// Shown within a ContestantCard when a contestant has more than one image
// (the spec). Horizontal swipe browses images; tap votes.
// These must never be confused — ambiguity always resolves toward "swipe",
// since a mis-fired vote is unrecoverable (votes are final).
import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { MediaItem } from '../api/client'
import { byDisplayOrder, srcSetFor } from '../utils/media'
import { exceedsSwipeThreshold, swipeDirection } from '../utils/swipe'

function frameStyle(item: MediaItem, index: number, currentIndex: number): CSSProperties {
  return {
    aspectRatio: item.aspect_ratio ?? undefined,
    width: '100%',
    minHeight: item.aspect_ratio ? undefined : '12rem',
    display: index === currentIndex ? 'block' : 'none',
  }
}

// Overlaid on the image itself, not stacked below it -- every image in the
// carousel occupies the same box regardless of whether paging controls are
// present, instead of the controls claiming their own row underneath.
function arrowStyle(side: 'left' | 'right', disabled: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    left: side === 'left' ? '0.35rem' : undefined,
    right: side === 'right' ? '0.35rem' : undefined,
    zIndex: 1,
    width: '1.75rem',
    height: '1.75rem',
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(0, 0, 0, 0.45)',
    color: '#fff',
    fontSize: '1rem',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.35 : 1,
  }
}

const dotsContainerStyle: CSSProperties = {
  position: 'absolute',
  bottom: '0.4rem',
  left: 0,
  right: 0,
  zIndex: 1,
  display: 'flex',
  justifyContent: 'center',
  gap: '0.3rem',
}

function dotStyle(active: boolean): CSSProperties {
  return {
    width: '0.35rem',
    height: '0.35rem',
    borderRadius: '50%',
    background: active ? '#fff' : 'rgba(255, 255, 255, 0.5)',
    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.35)',
  }
}

function CarouselFrameImage({ item }: { item: MediaItem }) {
  return (
    <img
      data-testid="carousel-image"
      alt=""
      src={item.variants[0]?.url}
      srcSet={srcSetFor(item)}
      sizes="50vw"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

interface ImageCarouselProps {
  media: MediaItem[]
  disabled?: boolean
  onTap: () => void
  // Extra content (the contestant's name) rendered inside the same
  // gesture-handling element — the whole card is one tap/swipe target and
  // a single tab stop (the spec), not just the image.
  children?: ReactNode
  // War detail's gallery reuses this carousel purely for browsing (no vote
  // to describe) — war-spec.md 10.4's "same page-through affordance the
  // vote card's own multi-image browsing already uses".
  ariaLabel?: string
}

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}

export function ImageCarousel({
  media,
  disabled = false,
  onTap,
  children,
  ariaLabel = 'Contestant photo — swipe to browse, tap to vote',
}: ImageCarouselProps) {
  const sorted = byDisplayOrder(media)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]))
  const gesture = useRef<{ startX: number; isSwiping: boolean } | null>(null)

  const showAffordance = sorted.length > 1

  function navigate(direction: 'next' | 'previous') {
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
    const clamped = Math.max(0, Math.min(sorted.length - 1, nextIndex))
    setCurrentIndex(clamped)
    setVisited((prev) => new Set(prev).add(clamped))
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    gesture.current = { startX: event.clientX, isSwiping: false }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gesture.current) return
    const deltaX = event.clientX - gesture.current.startX
    if (exceedsSwipeThreshold(deltaX)) {
      gesture.current.isSwiping = true
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current
    gesture.current = null
    if (!current) return

    if (current.isSwiping) {
      const direction = swipeDirection(event.clientX - current.startX)
      if (direction) navigate(direction)
      return
    }

    if (!disabled) onTap()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      navigate('previous')
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      navigate('next')
      return
    }
    if (isActivationKey(event.key) && !disabled) {
      event.preventDefault()
      onTap()
    }
  }

  return (
    <div
      data-testid="carousel-root"
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      style={{ touchAction: 'pan-y', width: '100%', cursor: disabled ? 'default' : 'pointer' }}
    >
      <div style={{ position: 'relative' }}>
        {sorted.map((item, index) => (
          <div key={item.id} style={frameStyle(item, index, currentIndex)}>
            {visited.has(index) && <CarouselFrameImage item={item} />}
          </div>
        ))}

        {showAffordance && (
          <>
            <button
              type="button"
              data-testid="carousel-arrow-previous"
              aria-label="Previous image"
              tabIndex={-1}
              disabled={currentIndex === 0}
              style={arrowStyle('left', currentIndex === 0)}
              // Stopped on pointerdown/pointerup too, not just click: those
              // bubble to the carousel's own tap-to-vote gesture handlers
              // *before* click ever fires, so stopping click alone still let
              // a mouse click here cast a vote underneath the navigation.
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                navigate('previous')
              }}
            >
              ‹
            </button>
            <button
              type="button"
              data-testid="carousel-arrow-next"
              aria-label="Next image"
              tabIndex={-1}
              disabled={currentIndex === sorted.length - 1}
              style={arrowStyle('right', currentIndex === sorted.length - 1)}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                navigate('next')
              }}
            >
              ›
            </button>
            <div data-testid="carousel-dots" style={dotsContainerStyle}>
              {sorted.map((item, index) => (
                <span
                  key={item.id}
                  data-testid="carousel-dot"
                  aria-hidden="true"
                  data-active={index === currentIndex}
                  style={dotStyle(index === currentIndex)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {children}
    </div>
  )
}
