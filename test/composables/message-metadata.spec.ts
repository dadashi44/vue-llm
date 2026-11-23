import { describe, it, expect, vi, afterEach } from 'vitest'
import { useChat } from '../../src/composables/use-chat'
import { createSSEProvider } from '../../src/providers/sse'
import { createProxyProvider, streamToSSE } from '../../src/server'
import type { ChatStreamChunk, LLMProvider } from '../../src/providers/types'
import type { UIMessage } from '../../src/types'

function scriptedProvider(chunks: ChatStreamChunk[]): LLMProvider {
  return {
    id: 'scripted',
    supportsStreaming: true,
    validateConfig() {},
    async chat() {
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

function sseResponse(events: string): Response {
  return new Response(events, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('message-metadata chunks', () => {
  it('merge into the metadata of the assistant message', async () => {
    const { messages, sendMessage } = useChat({
      provider: scriptedProvider([
        { type: 'message-metadata', metadata: { messageId: 42 } },
        { type: 'text-delta', text: 'Done.' },
        { type: 'message-metadata', metadata: { summary: 'Two wins', chart: { type: 'bar' } } },
        { type: 'finish', finishReason: 'stop' },
      ]),
      model: 'm',
    })

    await sendMessage('Stats?')

    const assistant = messages.value[1]
    expect(assistant.role).toBe('assistant')
    expect(assistant.metadata).toEqual({ messageId: 42, summary: 'Two wins', chart: { type: 'bar' } })
    expect(assistant.parts).toEqual([{ type: 'text', text: 'Done.', state: 'done' }])
    expect(messages.value[0].metadata).toBeUndefined()
  })

  it('replace earlier values of the same key', async () => {
    const { messages, sendMessage } = useChat({
      provider: scriptedProvider([
        { type: 'message-metadata', metadata: { status: 'running', step: 1 } },
        { type: 'message-metadata', metadata: { status: 'done' } },
        { type: 'finish', finishReason: 'stop' },
      ]),
      model: 'm',
    })

    await sendMessage('Go')

    expect(messages.value[1].metadata).toEqual({ status: 'done', step: 1 })
  })

  it('are in the message passed to onFinish', async () => {
    let finished: UIMessage | undefined
    const { sendMessage } = useChat({
      provider: scriptedProvider([
        { type: 'text-delta', text: 'Hi' },
        { type: 'message-metadata', metadata: { cost: 0.002 } },
        { type: 'finish', finishReason: 'stop' },
      ]),
      model: 'm',
      onFinish: (message) => { finished = message },
    })

    await sendMessage('Hello')

    expect(finished?.metadata).toEqual({ cost: 0.002 })
  })

  it('come from a custom backend through createSSEProvider mapEvent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(
      'event: text_delta\ndata: {"text":"Answer"}\n\n'
      + 'event: final\ndata: {"summary":"Short","sql_used":"SELECT 1"}\n\n'
      + 'event: done\ndata: {}\n\n',
    )))

    const provider = createSSEProvider({
      url: '/api/ask',
      mapEvent(event): ChatStreamChunk | null {
        const data = event.json as Record<string, unknown>
        if (event.event === 'text_delta') return { type: 'text-delta', text: String(data.text) }
        if (event.event === 'final') return { type: 'message-metadata', metadata: data }
        if (event.event === 'done') return { type: 'finish', finishReason: 'stop' }
        return null
      },
    })
    const { messages, sendMessage } = useChat({ provider, model: 'm' })

    await sendMessage('Q')

    expect(messages.value[1].metadata).toEqual({ summary: 'Short', sql_used: 'SELECT 1' })
    expect(messages.value[1].parts).toEqual([{ type: 'text', text: 'Answer', state: 'done' }])
  })

  it('pass from createLLMHandler streams to createProxyProvider', async () => {
    const body = await new Response(streamToSSE(new ReadableStream<ChatStreamChunk>({
      start(controller) {
        controller.enqueue({ type: 'text-delta', text: 'Hi' })
        controller.enqueue({ type: 'message-metadata', metadata: { sources: ['a.md'] } })
        controller.enqueue({ type: 'finish', finishReason: 'stop' })
        controller.close()
      },
    }))).text()
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(body)))

    const { messages, sendMessage } = useChat({ provider: createProxyProvider('/api/chat'), model: 'm' })
    await sendMessage('Q')

    expect(messages.value[1].metadata).toEqual({ sources: ['a.md'] })
  })
})
