import { describe, expect, it, vi } from 'vitest'
import { importWar, type ImportApi } from '../importWar'
import type { ValidatedWarImport } from '../validateWarImport'

function validatedImport(overrides: Partial<ValidatedWarImport> = {}): ValidatedWarImport {
  return {
    metadata: {
      title: 'Miss Universe 2026',
      category: 'Pageant',
      visibility: 'public',
      theme: 'arcade',
      ends_at: null,
      share_image: null,
    },
    contestants: [
      {
        name: 'Ada',
        bio: 'A brilliant mathematician.',
        media: [{ display_order: 0, aspect_ratio: 0.75, path: 'media/c-1/m-1.jpg' }],
      },
    ],
    ...overrides,
  }
}

function fakeApi(overrides: Partial<ImportApi> = {}): ImportApi {
  return {
    createWar: vi.fn().mockResolvedValue({ id: 'war-new' }),
    addContestant: vi.fn().mockResolvedValue({ id: 'contestant-new' }),
    uploadImage: vi.fn().mockResolvedValue(undefined),
    uploadShareImage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('importWar', () => {
  it("creates the War, then each contestant, then uploads each contestant's images in order", async () => {
    // Arrange
    const data = validatedImport()
    const files = { 'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]) }
    const api = fakeApi()

    // Act
    await importWar(data, files, api)

    // Assert
    expect(api.createWar).toHaveBeenCalledWith({
      title: 'Miss Universe 2026',
      category: 'Pageant',
      visibility: 'public',
      theme: 'arcade',
      ends_at: null,
    })
    expect(api.addContestant).toHaveBeenCalledWith('war-new', { name: 'Ada', bio: 'A brilliant mathematician.' })
    expect(api.uploadImage).toHaveBeenCalledWith('war-new', 'contestant-new', expect.any(File))
    const uploadedFile = (api.uploadImage as ReturnType<typeof vi.fn>).mock.calls[0][2] as File
    expect(uploadedFile.type).toBe('image/jpeg')
    const createOrder = (api.createWar as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    const addOrder = (api.addContestant as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    const uploadOrder = (api.uploadImage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    expect(createOrder).toBeLessThan(addOrder)
    expect(addOrder).toBeLessThan(uploadOrder)
  })

  it("sets each uploaded File's type from its path extension, so the server's MIME-type validation accepts it", async () => {
    // Arrange
    const data = validatedImport({
      contestants: [{ name: 'Ada', bio: null, media: [{ display_order: 0, aspect_ratio: 0.75, path: 'media/c-1/m-1.webp' }] }],
    })
    const files = { 'media/c-1/m-1.webp': new Uint8Array([1, 2, 3]) }
    const api = fakeApi()

    // Act
    await importWar(data, files, api)

    // Assert
    const uploadedFile = (api.uploadImage as ReturnType<typeof vi.fn>).mock.calls[0][2] as File
    expect(uploadedFile.type).toBe('image/webp')
  })

  it('returns the new War id on full success', async () => {
    // Arrange
    const data = validatedImport()
    const files = { 'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]) }
    const api = fakeApi()

    // Act
    const result = await importWar(data, files, api)

    // Assert
    expect(result).toEqual({ warId: 'war-new', error: null })
  })

  it('returns the created War id alongside an error when a contestant fails partway through', async () => {
    // Arrange
    const data = validatedImport({
      contestants: [
        { name: 'Ada', bio: null, media: [] },
        { name: 'Grace', bio: null, media: [] },
      ],
    })
    const api = fakeApi({
      addContestant: vi
        .fn()
        .mockResolvedValueOnce({ id: 'c-1' })
        .mockRejectedValueOnce(new Error('boom')),
    })

    // Act
    const result = await importWar(data, {}, api)

    // Assert
    expect(result.warId).toBe('war-new')
    expect(result.error).not.toBeNull()
  })

  it('uploads the share image after creating the War, when the import has one', async () => {
    // Arrange
    const data = validatedImport({ metadata: { ...validatedImport().metadata, share_image: 'share-image.jpg' }, contestants: [] })
    const files = { 'share-image.jpg': new Uint8Array([9, 9, 9]) }
    const api = fakeApi()

    // Act
    await importWar(data, files, api)

    // Assert
    expect(api.uploadShareImage).toHaveBeenCalledWith('war-new', expect.any(File))
    const createOrder = (api.createWar as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    const shareOrder = (api.uploadShareImage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    expect(createOrder).toBeLessThan(shareOrder)
  })

  it('does not upload a share image when the import has none', async () => {
    // Arrange
    const data = validatedImport({ contestants: [] })
    const api = fakeApi()

    // Act
    await importWar(data, {}, api)

    // Assert
    expect(api.uploadShareImage).not.toHaveBeenCalled()
  })

  it('returns a null War id and an error when creating the War itself fails', async () => {
    // Arrange
    const data = validatedImport()
    const api = fakeApi({ createWar: vi.fn().mockRejectedValue(new Error('boom')) })

    // Act
    const result = await importWar(data, {}, api)

    // Assert
    expect(result.warId).toBeNull()
    expect(result.error).not.toBeNull()
    expect(api.addContestant).not.toHaveBeenCalled()
  })
})
