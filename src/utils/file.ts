import type { FilePart } from '../types'

export type FileInput = File | FileList | FilePart | (File | FilePart)[]

export function fileToDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('[vue-llm] Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function convertFilesToParts(input: FileInput | undefined): Promise<FilePart[]> {
  if (!input) return []

  const items: (File | FilePart)[] = isFileList(input)
    ? Array.from(input)
    : Array.isArray(input) ? input : [input]

  return Promise.all(items.map(async (item): Promise<FilePart> => {
    if (isFilePart(item)) return item
    return {
      type: 'file',
      mediaType: item.type || 'application/octet-stream',
      url: await fileToDataURL(item),
      filename: item.name,
    }
  }))
}

export interface ResolvedFile {
  url: string
  mediaType: string
  filename?: string
  base64?: string
}

export function resolveFilePart(part: { url: string; mediaType?: string; filename?: string }): ResolvedFile {
  const parsed = parseDataURL(part.url)
  return {
    url: part.url,
    mediaType: part.mediaType ?? parsed?.mediaType ?? 'image/png',
    filename: part.filename,
    base64: parsed?.data,
  }
}

export function isTextMediaType(mediaType: string): boolean {
  return mediaType.startsWith('text/') || mediaType === 'application/json'
}

export function parseDataURL(url: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;,]*)(?:;[^,]*)?;base64,(.*)$/s.exec(url)
  if (!match) return null
  return { mediaType: match[1] || 'application/octet-stream', data: match[2] }
}

export function decodeBase64Text(data: string): string {
  const binary = atob(data)
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function isFileList(input: FileInput): input is FileList {
  return typeof FileList !== 'undefined' && input instanceof FileList
}

function isFilePart(item: File | FilePart): item is FilePart {
  return (item as FilePart).type === 'file' && typeof (item as FilePart).url === 'string'
}
