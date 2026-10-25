import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOpenAI } from '../../src/providers/openai'
import { createAnthropic } from '../../src/providers/anthropic'
import { createGoogle } from '../../src/providers/google'
import { createOllama } from '../../src/providers/ollama'
import type { ChatMessage, LLMProvider } from '../../src/providers/types'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const PDF = 'data:application/pdf;base64,JVBERi0='
const TXT = 'data:text/plain;base64,aGVsbG8='

function userMessage(...files: { url: string; mediaType: string; filename?: string }[]): ChatMessage[] {
  return [{
    role: 'user',
    content: [
      ...files.map(f => ({ type: 'file' as const, ...f })),
      { type: 'text', text: 'What is this?' },
    ],
  }]
}

async function captureBody(provider: LLMProvider, messages: ChatMessage[]): Promise<Record<string, unknown>> {
  const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
  globalThis.fetch = fetchMock as unknown as typeof fetch
  await provider.chat({ model: 'm', messages })
  const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  return JSON.parse(init[1].body as string)
}

describe('provider attachments', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubGlobal('window', undefined)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  it('OpenAI: images as image_url, PDFs as file, text inlined', async () => {
    const body = await captureBody(
      createOpenAI({ apiKey: 'k' }),
      userMessage(
        { url: PNG, mediaType: 'image/png' },
        { url: PDF, mediaType: 'application/pdf', filename: 'spec.pdf' },
        { url: TXT, mediaType: 'text/plain' },
      ),
    )
    const content = (body.messages as { content: unknown[] }[])[0].content

    expect(content).toEqual([
      { type: 'image_url', image_url: { url: PNG } },
      { type: 'file', file: { filename: 'spec.pdf', file_data: PDF } },
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'What is this?' },
    ])
  })

  it('OpenAI: rejects unsupported media types', async () => {
    const provider = createOpenAI({ apiKey: 'k' })
    await expect(captureBody(provider, userMessage({ url: 'data:application/zip;base64,UEs=', mediaType: 'application/zip' })))
      .rejects.toThrow('does not support application/zip')
  })

  it('Anthropic: base64 image, url image, PDF document, text document', async () => {
    const body = await captureBody(
      createAnthropic({ apiKey: 'k' }),
      userMessage(
        { url: PNG, mediaType: 'image/png' },
        { url: 'https://example.com/cat.jpg', mediaType: 'image/jpeg' },
        { url: PDF, mediaType: 'application/pdf', filename: 'spec.pdf' },
        { url: TXT, mediaType: 'text/plain' },
      ),
    )
    const content = (body.messages as { content: unknown[] }[])[0].content

    expect(content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
      { type: 'image', source: { type: 'url', url: 'https://example.com/cat.jpg' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' }, title: 'spec.pdf' },
      { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'hello' } },
      { type: 'text', text: 'What is this?' },
    ])
  })

  it('Google: inlineData for data URLs, fileData for remote URLs', async () => {
    const body = await captureBody(
      createGoogle({ apiKey: 'k' }),
      userMessage(
        { url: PDF, mediaType: 'application/pdf' },
        { url: 'gs://bucket/video.mp4', mediaType: 'video/mp4' },
      ),
    )
    const parts = (body.contents as { parts: unknown[] }[])[0].parts

    expect(parts).toEqual([
      { inlineData: { mimeType: 'application/pdf', data: 'JVBERi0=' } },
      { fileData: { mimeType: 'video/mp4', fileUri: 'gs://bucket/video.mp4' } },
      { text: 'What is this?' },
    ])
  })

  it('Ollama: images as base64 array, text appended to content', async () => {
    const body = await captureBody(
      createOllama(),
      userMessage({ url: PNG, mediaType: 'image/png' }, { url: TXT, mediaType: 'text/plain' }),
    )

    expect((body.messages as unknown[])[0]).toEqual({
      role: 'user',
      content: 'hello\n\nWhat is this?',
      images: ['iVBORw0KGgo='],
    })
  })

  it('Ollama: rejects remote URLs', async () => {
    await expect(captureBody(createOllama(), userMessage({ url: 'https://example.com/a.png', mediaType: 'image/png' })))
      .rejects.toThrow('data URLs')
  })
})
