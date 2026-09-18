// A temporary, invisible <a download> is still the only cross-browser way
// to save an in-memory Blob without navigating away from the page.
export function downloadBlob(bytes: Uint8Array, filename: string): void {
  // fflate's `zipSync` return type is `Uint8Array<ArrayBufferLike>`, which
  // TS's DOM lib doesn't accept as a `BlobPart` (it wants `ArrayBuffer`
  // specifically, never `SharedArrayBuffer`) -- the bytes are ordinary
  // heap-allocated data either way, so this cast is safe.
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
