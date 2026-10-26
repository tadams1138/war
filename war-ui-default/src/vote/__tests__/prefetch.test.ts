import { afterEach, expect, it, vi } from 'vitest'
import { buildVideoMediaItem } from '../../mocks/fixtures'
import { prefetchMatchupMedia } from '../prefetch'

afterEach(() => vi.unstubAllGlobals())

it('prefetches a video poster without requesting a player URL', () => {
  // Arrange
  const requested: string[] = []
  vi.stubGlobal('Image', class { set src(value: string) { requested.push(value) } })
  const media = [buildVideoMediaItem({ id: 'video-1', provider: 'youtube', video_id: 'abc123', poster_url: 'https://cdn.example.test/poster.jpg' })]

  // Act
  prefetchMatchupMedia(media)

  // Assert
  expect(requested).toEqual(['https://cdn.example.test/poster.jpg'])
})
