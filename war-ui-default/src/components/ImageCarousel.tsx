// Shown within a ContestantCard when a contestant has more than one image
// (the spec). Horizontal swipe browses images; tap votes.
// These must never be confused — ambiguity always resolves toward "swipe",
// since a mis-fired vote is unrecoverable (votes are final).
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { MediaItem } from '../api/client'
import { byDisplayOrder, srcSetFor } from '../utils/media'
import { exceedsSwipeThreshold, swipeDirection } from '../utils/swipe'

interface ImageCarouselProps {
  media: MediaItem[]
  disabled?: boolean
  onTap: () => void
  // Extra content (the contestant's name) rendered inside the same
  // gesture-handling element — the whole card is one tap/swipe target and
  // a single tab stop (the spec), not just the image.
  children?: ReactNode
}

export function ImageCarousel({ media, disabled = false, onTap, children }: ImageCarouselProps) {
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
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      navigate('next')
    } else if ((event.key === 'Enter' || event.key === ' ') && !disabled) {
      event.preventDefault()
      onTap()
    }
  }

  return (
    <div
      data-testid="carousel-root"
      role="group"
      aria-label="Contestant photo — swipe to browse, tap to vote"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      style={{ position: 'relative', touchAction: 'pan-y', width: '100%', cursor: disabled ? 'default' : 'pointer' }}
    >
      {sorted.map((item, index) => (
        <div
          key={item.id}
          style={{
            aspectRatio: item.aspect_ratio ?? undefined,
            width: '100%',
            minHeight: item.aspect_ratio ? undefined : '12rem',
            display: index === currentIndex ? 'block' : 'none',
          }}
        >
          {visited.has(index) && (
            <img
              data-testid="carousel-image"
              alt=""
              src={item.variants[0]?.url}
              srcSet={srcSetFor(item)}
              sizes="50vw"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>
      ))}
      {children}

      {showAffordance && (
        <>
          <button
            type="button"
            data-testid="carousel-arrow-previous"
            aria-label="Previous image"
            tabIndex={-1}
            disabled={currentIndex === 0}
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
            onClick={(event) => {
              event.stopPropagation()
              navigate('next')
            }}
          >
            ›
          </button>
          <div data-testid="carousel-dots">
            {sorted.map((item, index) => (
              <span key={item.id} data-testid="carousel-dot" aria-hidden="true" data-active={index === currentIndex} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
