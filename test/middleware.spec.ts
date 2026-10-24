import { describe, it, expect, vi } from 'vitest'
import { wrapProvider, loggingMiddleware, headerMiddleware } from '../src/middleware'
import type { Middleware } from '../src/middleware'
import type { LLMProvider, ChatRequest, ChatStreamChunk } from '../src/providers/types'

function createMockProvider(chunks: ChatStreamChunk[]): LLMProvider {
  return {
    id: 'mock',
    supportsStreaming: true,
    validateConfig: vi.fn(),
    chat: vi.fn(async (_request: ChatRequest) => {
      const stream = new ReadableStream<ChatStreamChunk>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk)
          controller.close()
        },
      })
      return {
        stream,
        response: Promise.resolve({ finishReason: 'stop' as const }),
      }
    }),
  }
}

async function drainStream(stream: ReadableStream<ChatStreamChunk>): Promise<ChatStreamChunk[]> {
  const result: ChatStreamChunk[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result.push(value)
  }
  return result
}

describe('middleware', () => {
  it('beforeRequest transforms the request', async () => {
    const provider = createMockProvider([
      { type: 'text-delta', text: 'ok' },
      { type: 'finish', finishReason: 'stop' },
    ])

    const mw: Middleware = {
      beforeRequest(request) {
        return { ...request, model: 'transformed-model' }
      },
    }

    const wrapped = wrapProvider(provider, [mw])
    await wrapped.chat({
      model: 'original-model',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'transformed-model' }),
    )
  })

  it('afterStream filters chunks', async () => {
    const provider = createMockProvider([
      { type: 'text-delta', text: 'hello' },
      { type: 'text-delta', text: ' secret' },
      { type: 'text-delta', text: ' world' },
      { type: 'finish', finishReason: 'stop' },
    ])

    const mw: Middleware = {
      afterStream(chunk) {
        if (chunk.type === 'text-delta' && chunk.text.includes('secret')) return null
        return chunk
      },
    }

    const wrapped = wrapProvider(provider, [mw])
    const { stream } = await wrapped.chat({
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
    })

    const chunks = await drainStream(stream)
    const texts = chunks.filter(c => c.type === 'text-delta')
    expect(texts).toHaveLength(2)
    expect(texts[0].type === 'text-delta' && texts[0].text).toBe('hello')
    expect(texts[1].type === 'text-delta' && texts[1].text).toBe(' world')
  })

  it('onError intercepts errors', async () => {
    const provider: LLMProvider = {
      id: 'mock',
      supportsStreaming: true,
      validateConfig: vi.fn(),
      chat: vi.fn(async () => { throw new Error('API error 500') }),
    }

    const onError = vi.fn((error: Error) => {
      return new Error(`Wrapped: ${error.message}`)
    })

    const wrapped = wrapProvider(provider, [{ onError }])

    await expect(wrapped.chat({
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow('Wrapped: API error 500')

    expect(onError).toHaveBeenCalled()
  })

  it('chains multiple middlewares in order', async () => {
    const order: string[] = []

    const provider = createMockProvider([
      { type: 'text-delta', text: 'ok' },
      { type: 'finish', finishReason: 'stop' },
    ])

    const mw1: Middleware = {
      beforeRequest(request) {
        order.push('mw1')
        return request
      },
    }

    const mw2: Middleware = {
      beforeRequest(request) {
        order.push('mw2')
        return request
      },
    }

    const wrapped = wrapProvider(provider, [mw1, mw2])
    await wrapped.chat({
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(order).toEqual(['mw1', 'mw2'])
  })

  it('loggingMiddleware logs request and finish', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const provider = createMockProvider([
      { type: 'text-delta', text: 'hi' },
      { type: 'finish', finishReason: 'stop' },
    ])

    const wrapped = wrapProvider(provider, [loggingMiddleware('test')])
    const { stream } = await wrapped.chat({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
    })

    await drainStream(stream)

    expect(consoleSpy).toHaveBeenCalledWith(
      '[test] → gpt-4o',
      1,
      'messages',
    )

    consoleSpy.mockRestore()
  })

  it('headerMiddleware injects providerOptions.headers', async () => {
    const provider = createMockProvider([
      { type: 'finish', finishReason: 'stop' },
    ])

    const wrapped = wrapProvider(provider, [headerMiddleware({ 'X-Custom': 'value' })])
    await wrapped.chat({
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: expect.objectContaining({
          headers: expect.objectContaining({ 'X-Custom': 'value' }),
        }),
      }),
    )
  })

  it('returns provider unchanged when no middlewares', () => {
    const provider = createMockProvider([])
    const wrapped = wrapProvider(provider, [])
    expect(wrapped).toBe(provider)
  })

  it('validateConfig delegates to original provider', () => {
    const provider = createMockProvider([])
    const wrapped = wrapProvider(provider, [{ beforeRequest: r => r }])
    wrapped.validateConfig()
    expect(provider.validateConfig).toHaveBeenCalled()
  })
})
