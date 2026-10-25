import { describe, it, expect } from 'vitest'
import { convertFilesToParts, decodeBase64Text, parseDataURL, resolveFilePart } from '../../src/utils/file'
import type { FilePart } from '../../src/types'

describe('file utils', () => {
  it('converts File objects to data-URL FileParts', async () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })
    const [part] = await convertFilesToParts([file])

    expect(part).toMatchObject({ type: 'file', mediaType: 'text/plain', filename: 'note.txt' })
    expect(part.url).toBe('data:text/plain;base64,aGVsbG8=')
  })

  it('passes existing FileParts through unchanged', async () => {
    const existing: FilePart = { type: 'file', mediaType: 'image/png', url: 'https://example.com/cat.png' }
    const parts = await convertFilesToParts(existing)

    expect(parts).toEqual([existing])
  })

  it('parses base64 data URLs and rejects others', () => {
    expect(parseDataURL('data:image/png;base64,AAAA')).toEqual({ mediaType: 'image/png', data: 'AAAA' })
    expect(parseDataURL('https://example.com/a.png')).toBeNull()
  })

  it('resolves media type from the data URL when missing', () => {
    const file = resolveFilePart({ url: 'data:image/webp;base64,AAAA' })
    expect(file).toMatchObject({ mediaType: 'image/webp', base64: 'AAAA' })
  })

  it('decodes UTF-8 base64 text', () => {
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode('привет')))
    expect(decodeBase64Text(encoded)).toBe('привет')
  })
})
