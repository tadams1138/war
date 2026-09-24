import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildContestant, buildMediaItem, buildWarDetail } from '../../mocks/fixtures'
import { buildWarExportZip } from '../exportWar'

async function fakeFetchBinary(): Promise<Uint8Array> {
  return new TextEncoder().encode('fake-image-bytes')
}

function readJson(files: Record<string, Uint8Array>): Record<string, unknown> {
  return JSON.parse(strFromU8(files['war.json'])) as Record<string, unknown>
}

describe('buildWarExportZip', () => {
  it('includes War metadata in war.json', async () => {
    // Arrange
    const war = buildWarDetail({
      title: 'Miss Universe 2026',
      category: 'Pageant',
      visibility: 'invite_only',
      theme: 'fight_card',
      ends_at: '2026-12-31T00:00:00.000Z',
      contestants: [],
    })

    // Act
    const zip = await buildWarExportZip(war, fakeFetchBinary)
    const json = readJson(unzipSync(zip))

    // Assert
    expect(json).toMatchObject({
      title: 'Miss Universe 2026',
      category: 'Pageant',
      visibility: 'invite_only',
      theme: 'fight_card',
      ends_at: '2026-12-31T00:00:00.000Z',
    })
  })

  it("includes each contestant's name and bio, but no attributes, votes, win_count, or appearance_count", async () => {
    // Arrange
    const contestant = buildContestant({
      id: 'c-1',
      name: 'Ada',
      bio: 'A brilliant mathematician.',
      media: [],
      win_count: 7,
      appearance_count: 9,
    })
    const war = buildWarDetail({ contestants: [contestant] })

    // Act
    const zip = await buildWarExportZip(war, fakeFetchBinary)
    const json = readJson(unzipSync(zip))
    const exported = (json.contestants as Record<string, unknown>[])[0]

    // Assert
    expect(exported).toMatchObject({
      name: 'Ada',
      bio: 'A brilliant mathematician.',
    })
    expect(exported).not.toHaveProperty('attributes')
    expect(exported).not.toHaveProperty('win_count')
    expect(exported).not.toHaveProperty('appearance_count')
    expect(json).not.toHaveProperty('contestant_schema')
  })

  it('fetches and includes the largest-width media variant, referenced by its path in war.json', async () => {
    // Arrange
    const fetchedUrls: string[] = []
    async function trackingFetch(url: string): Promise<Uint8Array> {
      fetchedUrls.push(url)
      return fakeFetchBinary()
    }
    const media = buildMediaItem({
      id: 'm-1',
      variants: [
        { width: 400, url: 'https://cdn.example.test/m-1/400.jpg' },
        { width: 1600, url: 'https://cdn.example.test/m-1/1600.jpg' },
      ],
    })
    const contestant = buildContestant({ id: 'c-1', media: [media] })
    const war = buildWarDetail({ contestants: [contestant] })

    // Act
    const zip = await buildWarExportZip(war, trackingFetch)
    const files = unzipSync(zip)
    const json = readJson(files)
    const exportedMedia = (json.contestants as Record<string, unknown>[])[0].media as Record<string, unknown>[]

    // Assert
    expect(fetchedUrls).toEqual(['https://cdn.example.test/m-1/1600.jpg'])
    expect(exportedMedia[0].path).toBe('media/c-1/m-1.jpg')
    expect(files['media/c-1/m-1.jpg']).toBeDefined()
  })

  it('names each media file under media/<contestantId>/<mediaId>.<ext>', async () => {
    // Arrange
    const media = buildMediaItem({ id: 'm-2', variants: [{ width: 800, url: 'https://cdn.example.test/m-2/800.png' }] })
    const contestant = buildContestant({ id: 'c-2', media: [media] })
    const war = buildWarDetail({ contestants: [contestant] })

    // Act
    const zip = await buildWarExportZip(war, fakeFetchBinary)
    const files = unzipSync(zip)

    // Assert
    expect(files['media/c-2/m-2.png']).toBeDefined()
  })

  it("fetches and includes the War's share image, referenced by its path in war.json", async () => {
    // Arrange
    const fetchedUrls: string[] = []
    async function trackingFetch(url: string): Promise<Uint8Array> {
      fetchedUrls.push(url)
      return fakeFetchBinary()
    }
    const war = buildWarDetail({ share_image_url: 'https://cdn.example.test/share/war-1.jpg', contestants: [] })

    // Act
    const zip = await buildWarExportZip(war, trackingFetch)
    const files = unzipSync(zip)
    const json = readJson(files)

    // Assert
    expect(fetchedUrls).toEqual(['https://cdn.example.test/share/war-1.jpg'])
    expect(json.share_image).toBe('share-image.jpg')
    expect(files['share-image.jpg']).toBeDefined()
  })

  it('has a null share_image and no share-image file when the War has none', async () => {
    // Arrange
    const war = buildWarDetail({ share_image_url: null, contestants: [] })

    // Act
    const zip = await buildWarExportZip(war, fakeFetchBinary)
    const files = unzipSync(zip)
    const json = readJson(files)

    // Assert
    expect(json.share_image).toBeNull()
    expect(Object.keys(files).some((path) => path.startsWith('share-image'))).toBe(false)
  })

  it('omits media entirely for a contestant with no images', async () => {
    // Arrange
    const contestant = buildContestant({ id: 'c-3', media: [] })
    const war = buildWarDetail({ contestants: [contestant] })

    // Act
    const zip = await buildWarExportZip(war, fakeFetchBinary)
    const files = unzipSync(zip)
    const json = readJson(files)
    const exportedMedia = (json.contestants as Record<string, unknown>[])[0].media

    // Assert
    expect(exportedMedia).toEqual([])
    expect(Object.keys(files).filter((path) => path.startsWith('media/'))).toHaveLength(0)
  })
})
