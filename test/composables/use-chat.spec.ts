import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { useChat } from '../../src/composables/use-chat'
import type { LLMProvider, ChatRequest, ChatStreamChunk } from '../../src/providers/types'

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

describe('useChat', () => {
  it('sends a message and receives streaming response', async () => {
    const provider = createMockProvider([
      { type: 'text-delta', text: 'Hello' },
      { type: 'text-delta', text: ' there' },
      { type: 'finish', finishReason: 'stop' },
    ])

    const { messages, sendMessage, isLoading } = useChat({
      provider,
      model: 'test-model',
    })

    expect(messages.value).toHaveLength(0)

    await sendMessage('Hi')
    await nextTick()

    expect(messages.value).toHaveLength(2)
    expect(messages.value[0].role).toBe('user')
    expect(messages.value[0].parts[0]).toMatchObject({ type: 'text', text: 'Hi' })
    expect(messages.value[1].role).toBe('assistant')
    expect(messages.value[1].parts[0]).toMatchObject({ type: 'text', text: 'Hello there' })
    expect(isLoading.value).toBe(false)
  })

  it('clears input after sending', async () => {
    const provider = createMockProvider([
      { type: 'text-delta', text: 'ok' },
      { type: 'finish', finishReason: 'stop' },
    ])

    const { input, sendMessage } = useChat({ provider, model: 'test' })
    input.value = 'Hello'

    await sendMessage()
    expect(input.value).toBe('')
  })

  it('does not send empty messages', async () => {
    const provider = createMockProvider([])

    const { sendMessage, messages } = useChat({ provider, model: 'test' })
    await sendMessage('')

    expect(messages.value).toHaveLength(0)
    expect(provider.chat).not.toHaveBeenCalled()
  })

  it('passes system prompt to provider', async () => {
    const provider = createMockProvider([
      { type: 'text-delta', text: 'hi' },
      { type: 'finish', finishReason: 'stop' },
    ])

    const { sendMessage } = useChat({
      provider,
      model: 'test',
      system: 'You are helpful',
    })

    await sendMessage('Hey')

    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.messages[0]).toMatchObject({ role: 'system', content: 'You are helpful' })
    expect(call.messages[1]).toMatchObject({ role: 'user', content: 'Hey' })
  })

  it('calls onFinish callback', async () => {
    const onFinish = vi.fn()
    const provider = createMockProvider([
      { type: 'text-delta', text: 'done' },
      { type: 'finish', finishReason: 'stop' },
    ])

    const { sendMessage } = useChat({ provider, model: 'test', onFinish })
    await sendMessage('go')

    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('handles provider errors', async () => {
    const provider: LLMProvider = {
      id: 'failing',
      supportsStreaming: true,
      validateConfig: vi.fn(),
      chat: vi.fn(async () => { throw new Error('API down') }),
    }

    const onError = vi.fn()
    const { sendMessage, status, error } = useChat({ provider, model: 'test', onError })

    await sendMessage('test')

    expect(status.value).toBe('error')
    expect(error.value?.message).toBe('API down')
  })

  it('validates provider config before calling', async () => {
    const provider = createMockProvider([
      { type: 'text-delta', text: 'ok' },
      { type: 'finish', finishReason: 'stop' },
    ])

    const { sendMessage } = useChat({ provider, model: 'test' })
    await sendMessage('hi')

    expect(provider.validateConfig).toHaveBeenCalled()
  })

  it('stops streaming on stop()', async () => {
    let controllerRef: ReadableStreamDefaultController<ChatStreamChunk> | null = null

    const provider: LLMProvider = {
      id: 'slow',
      supportsStreaming: true,
      validateConfig: vi.fn(),
      chat: vi.fn(async () => {
        const stream = new ReadableStream<ChatStreamChunk>({
          start(controller) { controllerRef = controller },
        })
        return { stream, response: Promise.resolve({ finishReason: 'stop' as const }) }
      }),
    }

    const { sendMessage, stop, status } = useChat({ provider, model: 'test' })

    const promise = sendMessage('hi')
    await nextTick()

    stop()
    if (controllerRef) (controllerRef as ReadableStreamDefaultController<ChatStreamChunk>).close()

    await promise
    expect(status.value).toBe('ready')
  })

  it('setMessages replaces messages', async () => {
    const provider = createMockProvider([])
    const { messages, setMessages } = useChat({ provider, model: 'test' })

    setMessages([{
      id: '1',
      role: 'user',
      parts: [{ type: 'text', text: 'injected', state: 'done' }],
    }])

    expect(messages.value).toHaveLength(1)
    expect(messages.value[0].parts[0]).toMatchObject({ text: 'injected' })
  })

  it('clearError resets status', async () => {
    const provider: LLMProvider = {
      id: 'err',
      supportsStreaming: true,
      validateConfig: vi.fn(),
      chat: vi.fn(async () => { throw new Error('fail') }),
    }

    const { sendMessage, status, error, clearError } = useChat({ provider, model: 'test' })
    await sendMessage('x')

    expect(status.value).toBe('error')
    clearError()
    expect(status.value).toBe('ready')
    expect(error.value).toBeUndefined()
  })
})
