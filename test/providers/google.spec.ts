import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createGoogle } from '../../src/providers/google'
import type { ChatStreamChunk } from '../../src/providers/types'

function sseLines(chunks: unknown[]): string {
  return chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('')
}

function fakeResponse(body: string, ok = true): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  })
  return {
    ok,
    status: ok ? 200 : 400,
    body: stream,
    text: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response
}

async function drainStream(stream: ReadableStream<ChatStreamChunk>): Promise<ChatStreamChunk[]> {
  const chunks: ChatStreamChunk[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

describe('createGoogle', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubGlobal('window', undefined)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('validates missing API key', () => {
    const provider = createGoogle({ apiKey: '' })
    expect(() => provider.validateConfig()).toThrow('API key is required')
  })

  it('streams text deltas from Gemini SSE', async () => {
    const body = sseLines([
      {
        candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
      },
      {
        candidates: [{ content: { parts: [{ text: ' world' }] } }],
      },
      {
        candidates: [{ content: { parts: [{ text: '!' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
      },
    ])

    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(body))

    const provider = createGoogle({ apiKey: 'test-key' })
    const { stream } = await provider.chat({
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    const chunks = await drainStream(stream)

    const textChunks = chunks.filter(c => c.type === 'text-delta')
    expect(textChunks).toHaveLength(3)
    expect(textChunks[0].type === 'text-delta' && textChunks[0].text).toBe('Hello')
    expect(textChunks[1].type === 'text-delta' && textChunks[1].text).toBe(' world')
    expect(textChunks[2].type === 'text-delta' && textChunks[2].text).toBe('!')

    const finish = chunks.find(c => c.type === 'finish')
    expect(finish).toBeDefined()
    expect(finish!.type === 'finish' && finish!.finishReason).toBe('stop')
    expect(finish!.type === 'finish' && finish!.usage).toEqual({ promptTokens: 5, completionTokens: 3, totalTokens: 8 })
  })

  it('sends correct URL with model and API key', async () => {
    const body = sseLines([
      { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] },
    ])

    const mockFetch = vi.fn().mockResolvedValue(fakeResponse(body))
    globalThis.fetch = mockFetch

    const provider = createGoogle({ apiKey: 'my-key' })
    const { stream } = await provider.chat({
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'test' }],
    })

    await drainStream(stream)

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('gemini-2.0-flash:streamGenerateContent')
    expect(calledUrl).toContain('key=my-key')
    expect(calledUrl).toContain('alt=sse')
  })

  it('extracts system instruction from messages', async () => {
    const body = sseLines([
      { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] },
    ])

    const mockFetch = vi.fn().mockResolvedValue(fakeResponse(body))
    globalThis.fetch = mockFetch

    const provider = createGoogle({ apiKey: 'test-key' })
    const { stream } = await provider.chat({
      model: 'gemini-2.0-flash',
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ],
    })

    await drainStream(stream)

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sentBody.systemInstruction).toEqual({ parts: [{ text: 'You are helpful' }] })
    expect(sentBody.contents.every((c: Record<string, string>) => c.role !== 'system')).toBe(true)
  })

  it('handles tool calls (function calling)', async () => {
    const body = sseLines([
      {
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: 'getWeather', args: { city: 'Paris' } },
            }],
          },
          finishReason: 'STOP',
        }],
      },
    ])

    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(body))

    const provider = createGoogle({ apiKey: 'test-key' })
    const { stream } = await provider.chat({
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Weather in Paris?' }],
      tools: [{ name: 'getWeather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } }],
    })

    const chunks = await drainStream(stream)

    const start = chunks.find(c => c.type === 'tool-call-start')
    expect(start).toBeDefined()
    expect(start!.type === 'tool-call-start' && start!.toolName).toBe('getWeather')

    const delta = chunks.find(c => c.type === 'tool-call-delta')
    expect(delta).toBeDefined()
    expect(delta!.type === 'tool-call-delta' && JSON.parse(delta!.type === 'tool-call-delta' ? delta!.args : '')).toEqual({ city: 'Paris' })

    const end = chunks.find(c => c.type === 'tool-call-end')
    expect(end).toBeDefined()
  })

  it('throws on API error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse('{"error":"bad request"}', false))

    const provider = createGoogle({ apiKey: 'test-key' })
    await expect(provider.chat({
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toThrow('Google AI API error 400')
  })

  it('maps role correctly (assistant → model)', async () => {
    const body = sseLines([
      { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] },
    ])

    const mockFetch = vi.fn().mockResolvedValue(fakeResponse(body))
    globalThis.fetch = mockFetch

    const provider = createGoogle({ apiKey: 'test-key' })
    const { stream } = await provider.chat({
      model: 'gemini-2.0-flash',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'How are you?' },
      ],
    })

    await drainStream(stream)

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sentBody.contents[0].role).toBe('user')
    expect(sentBody.contents[1].role).toBe('model')
    expect(sentBody.contents[2].role).toBe('user')
  })
})
