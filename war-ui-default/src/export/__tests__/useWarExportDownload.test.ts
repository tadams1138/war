import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildWarDetail } from '../../mocks/fixtures'
import * as download from '../downloadFile'
import { useWarExportDownload } from '../useWarExportDownload'

vi.mock('../downloadFile', () => ({ downloadBlob: vi.fn() }))

describe('useWarExportDownload', () => {
  afterEach(() => {
    vi.mocked(download.downloadBlob).mockReset()
  })

  it('downloads the zip', async () => {
    // Arrange
    const war = buildWarDetail({ id: 'war-1', contestants: [] })
    const { result } = renderHook(() => useWarExportDownload(war))

    // Act
    act(() => result.current.trigger())
    await waitFor(() => expect(download.downloadBlob).toHaveBeenCalled())

    // Assert
    expect(download.downloadBlob).toHaveBeenCalledWith(expect.any(Uint8Array), 'war-war-1.zip')
  })
})
