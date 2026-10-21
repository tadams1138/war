import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as client from '../../api/client'
import { buildWarDetail } from '../../mocks/fixtures'
import * as download from '../downloadFile'
import { useWarExportDownload } from '../useWarExportDownload'

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  return { ...actual, recordWarExport: vi.fn() }
})
vi.mock('../downloadFile', () => ({ downloadBlob: vi.fn() }))

describe('useWarExportDownload', () => {
  afterEach(() => {
    vi.mocked(client.recordWarExport).mockReset()
    vi.mocked(download.downloadBlob).mockReset()
  })

  it('tells the API about the export and downloads the zip', async () => {
    // Arrange
    vi.mocked(client.recordWarExport).mockResolvedValue(undefined)
    const war = buildWarDetail({ id: 'war-1', contestants: [] })
    const { result } = renderHook(() => useWarExportDownload(war))

    // Act
    act(() => result.current.trigger())
    await waitFor(() => expect(download.downloadBlob).toHaveBeenCalled())

    // Assert
    expect(client.recordWarExport).toHaveBeenCalledWith('war-1')
    expect(download.downloadBlob).toHaveBeenCalledWith(expect.any(Uint8Array), 'war-war-1.zip')
  })

  it('still downloads the zip, with no error, when the API cannot record the export', async () => {
    // Arrange
    vi.mocked(client.recordWarExport).mockRejectedValue(new Error('offline'))
    const war = buildWarDetail({ id: 'war-1', contestants: [] })
    const { result } = renderHook(() => useWarExportDownload(war))

    // Act
    act(() => result.current.trigger())
    await waitFor(() => expect(download.downloadBlob).toHaveBeenCalled())

    // Assert
    expect(result.current.error).toBeNull()
  })
})
