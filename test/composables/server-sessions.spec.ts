import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { useChat } from '../../src/composables/use-chat'
import { createSSEProvider } from '../../src/providers/sse'
import { createMemoryStorage } from '../../src/core/storage'
import type { ChatRequest, ChatStreamChunk, LLMProvider } from '../../src/providers/types'
import type { UIMessage } from '../../src/types'

/** Each call to chat() streams the next script; requests are recorded without the signal */
function scriptedProvider(...scripts: ChatStreamChunk[][]): LLMProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  return {
    id: 'scripted',
    supportsStreaming: true,
    requests,
    validateConfig() {},
    async chat(request) {
      requests.push({ ...request, signal: undefined })
      const chunks = scripts[requests.length - 1] ?? [{ type: 'finish', finishReason: 'stop' }]
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk)
            controller.close()
          },
        }),
        response: Promise.resolve({ finishReason: 'stop' }),
      }
    },
  }
}

/** A provider whose stream stays open until the request is aborted */
function hangingProvider(): LLMProvider & { aborted: boolean[] } {
  const aborted: boolean[] = []
  return {
    id: 'hanging',
    supportsStreaming: true,
    aborted,
    validateConfig() {},
    async chat(request) {
      const index = aborted.push(false) - 1
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-delta', text: 'partial' })
            request.signal?.addEventListener('abort', () => {
              aborted[index] = true
              controller.close()
            })
          },
        }),
        response: new Promise(() => {}),
      }
    },
  }
}

const userMessage = (id: string, text: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text, state: 'done' }] })

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('message-start', () => {
  it('gives the assistant message the id from the backend', async () => {
    const provider = scriptedProvider([
      { type: 'message-start', id: 'msg_db_17' },
      { type: 'text-delta', text: 'Hi' },
      { type: 'finish', finishReason: 'stop' },
    ])
    const { messages, sendMessage } = useChat({ provider, model: 'm' })

    await sendMessage('Hello')

    expect(messages.value[1]).toMatchObject({ id: 'msg_db_17', role: 'assistant' })
  })
})

describe('request trigger', () => {
  it('marks a new message as submit with the id of the user message', async () => {
    const provider = scriptedProvider()
    const { messages, sendMessage } = useChat({ provider, model: 'm' })

    await sendMessage('Hello')

    expect(provider.requests[0]).toMatchObject({ trigger: 'submit', messageId: messages.value[0].id })
  })

  it('marks regenerate with the id of the replaced assistant message', async () => {
    const provider = scriptedProvider(
      [{ type: 'message-start', id: 'msg_db_1' }, { type: 'text-delta', text: 'First' }, { type: 'finish', finishReason: 'stop' }],
      [{ type: 'message-start', id: 'msg_db_2' }, { type: 'text-delta', text: 'Second' }, { type: 'finish', finishReason: 'stop' }],
    )
    const { messages, sendMessage, regenerate } = useChat({ provider, model: 'm' })

    await sendMessage('Hello')
    await regenerate()

    expect(provider.requests[1]).toMatchObject({ trigger: 'regenerate', messageId: 'msg_db_1' })
    expect(messages.value.map(m => m.id)).toEqual([messages.value[0].id, 'msg_db_2'])
  })

  it('marks requests that send tool results as continue', async () => {
    const provider = scriptedProvider(
      [
        { type: 'tool-call-start', toolCallId: 'c1', toolName: 'lookup' },
        { type: 'tool-call-delta', toolCallId: 'c1', args: '{}' },
        { type: 'tool-call-end', toolCallId: 'c1' },
        { type: 'finish', finishReason: 'tool-calls' },
      ],
      [{ type: 'text-delta', text: 'Done' }, { type: 'finish', finishReason: 'stop' }],
    )
    const { sendMessage } = useChat({
      provider,
      model: 'm',
      tools: [{ name: 'lookup', description: '', parameters: {}, execute: () => 'ok' }],
    })

    await sendMessage('Go')

    expect(provider.requests.map(r => r.trigger)).toEqual(['submit', 'continue'])
    expect(provider.requests[1].messageId).toBeUndefined()
  })

  it('marks the request after addToolResult as continue', async () => {
    const provider = scriptedProvider(
      [
        { type: 'tool-call-start', toolCallId: 'c1', toolName: 'confirm' },
        { type: 'tool-call-delta', toolCallId: 'c1', args: '{}' },
        { type: 'tool-call-end', toolCallId: 'c1' },
        { type: 'finish', finishReason: 'tool-calls' },
      ],
    )
    const { sendMessage, addToolResult } = useChat({ provider, model: 'm' })

    await sendMessage('Delete it')
    await addToolResult({ toolCallId: 'c1', result: { approved: true } })

    expect(provider.requests.map(r => r.trigger)).toEqual(['submit', 'continue'])
  })
})

describe('createSSEProvider mapEvent', () => {
  it('receives the response to read headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: {"text":"Hi"}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'X-Message-Id': 'msg_db_9' },
    })))
    const provider = createSSEProvider({
      url: '/api/ask',
      mapEvent: ({ json, response }) => [
        { type: 'message-start', id: response.headers.get('X-Message-Id')! },
        { type: 'text-delta', text: (json as { text: string }).text },
      ],
    })
    const { messages, sendMessage } = useChat({ provider, model: 'm' })

    await sendMessage('Hello')

    expect(messages.value[1]).toMatchObject({ id: 'msg_db_9', parts: [{ type: 'text', text: 'Hi' }] })
  })
})

describe('reactive id', () => {
  it('loads the history of the new chat when the id changes', async () => {
    const storage = createMemoryStorage()
    storage.save('a', [userMessage('1', 'In chat A')])
    storage.save('b', [userMessage('2', 'In chat B')])
    const sessionId = ref('a')

    const chat = useChat({ provider: scriptedProvider(), model: 'm', id: sessionId, storage })
    expect(chat.messages.value.map(m => m.id)).toEqual(['1'])
    expect(chat.id).toBe('a')

    sessionId.value = 'b'
    await flush()

    expect(chat.messages.value.map(m => m.id)).toEqual(['2'])
    expect(chat.id).toBe('b')
    expect(chat.isRestored.value).toBe(true)
  })

  it('saves new messages under the current id', async () => {
    const storage = createMemoryStorage()
    const sessionId = ref('a')
    const { sendMessage } = useChat({ provider: scriptedProvider(), model: 'm', id: sessionId, storage })

    sessionId.value = 'b'
    await flush()
    await sendMessage('Hello B')
    await flush()

    expect(storage.load('a')).toBeFalsy()
    expect((storage.load('b') as UIMessage[]).map(m => m.role)).toEqual(['user', 'assistant'])
  })

  it('starts empty for an id without history and without storage', async () => {
    const sessionId = ref('a')
    const { messages, sendMessage } = useChat({ provider: scriptedProvider(), model: 'm', id: sessionId })
    await sendMessage('Hello A')

    sessionId.value = 'b'
    await flush()

    expect(messages.value).toEqual([])
  })

  it('stops the stream of the previous chat', async () => {
    const provider = hangingProvider()
    const sessionId = ref('a')
    const { status, sendMessage } = useChat({ provider, model: 'm', id: sessionId })

    const sending = sendMessage('Long answer please')
    await flush()
    expect(status.value).toBe('streaming')

    sessionId.value = 'b'
    await flush()
    await sending

    expect(provider.aborted).toEqual([true])
    expect(status.value).toBe('ready')
  })

  it('ignores a slow load of a chat that is no longer current', async () => {
    let resolveA!: (messages: UIMessage[]) => void
    const storage = {
      load: vi.fn((id: string) => id === 'a'
        ? new Promise<UIMessage[]>((resolve) => { resolveA = resolve })
        : Promise.resolve([userMessage('2', 'In chat B')])),
      save: vi.fn(),
      remove: vi.fn(),
    }
    const sessionId = ref('a')
    const { messages } = useChat({ provider: scriptedProvider(), model: 'm', id: sessionId, storage })

    sessionId.value = 'b'
    await flush()
    resolveA([userMessage('1', 'In chat A')])
    await flush()

    expect(messages.value.map(m => m.id)).toEqual(['2'])
    expect(storage.save).not.toHaveBeenCalledWith('b', expect.arrayContaining([expect.objectContaining({ id: '1' })]))
  })
})
