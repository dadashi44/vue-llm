import { describe, it, expect, vi } from 'vitest'
import { watch } from 'vue'
import { useChat } from '../../src/composables/use-chat'
import { defineTool, type ToolCallPart } from '../../src/types'
import type { ChatRequest, ChatStreamChunk, LLMProvider } from '../../src/providers/types'

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)))

/** Each call to chat() streams the next script */
function scriptedProvider(...scripts: ChatStreamChunk[][]): LLMProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  return {
    id: 'scripted',
    supportsStreaming: true,
    requests,
    validateConfig() {},
    async chat(request) {
      requests.push(clone({ ...request, signal: undefined }))
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

const toolCall = (id: string, name: string, args: string[]): ChatStreamChunk[] => [
  { type: 'tool-call-start', toolCallId: id, toolName: name },
  ...args.map(a => ({ type: 'tool-call-delta' as const, toolCallId: id, args: a })),
  { type: 'tool-call-end', toolCallId: id },
]

const toolParts = (messages: { parts: { type: string }[] }[]): ToolCallPart[] =>
  messages.flatMap(m => m.parts).filter((p): p is ToolCallPart => p.type === 'tool-call')

describe('generative UI in useChat', () => {
  it('exposes partially parsed arguments while they stream', async () => {
    const provider = scriptedProvider([
      ...toolCall('c1', 'weather', ['{"city":"Os', 'lo","days":', '3}']),
      { type: 'finish', finishReason: 'stop' },
    ])
    const { messages, sendMessage } = useChat({ provider, model: 'm', onToolCall: () => undefined })

    const seen: unknown[] = []
    watch(messages, msgs => {
      const part = toolParts(msgs)[0]
      if (part?.state === 'streaming' && part.args) seen.push(clone(part.args))
    }, { flush: 'sync' })

    await sendMessage('weather?')

    expect(seen).toEqual([{ city: 'Os' }, { city: 'Oslo' }, { city: 'Oslo', days: 3 }])
    expect(toolParts(messages.value)[0]).toMatchObject({ args: { city: 'Oslo', days: 3 }, state: 'pending' })
  })

  it('runs execute, sends results back and strips execute from provider tools', async () => {
    const execute = vi.fn(async ({ city }: { city: string }, _context: { signal: AbortSignal }) => ({ city, temp: 12 }))
    const weather = defineTool<{ city: string }, { city: string; temp: number }>({
      name: 'weather',
      description: 'Get weather',
      parameters: { type: 'object' },
      execute,
    })
    const provider = scriptedProvider(
      [...toolCall('c1', 'weather', ['{"city":"Oslo"}']), { type: 'finish', finishReason: 'tool-calls' }],
      [{ type: 'text-delta', text: '12 degrees' }, { type: 'finish', finishReason: 'stop' }],
    )
    const { messages, sendMessage } = useChat({ provider, model: 'm', tools: [weather] })

    await sendMessage('weather?')

    expect(execute).toHaveBeenCalledWith({ city: 'Oslo' }, expect.objectContaining({ toolCallId: 'c1' }))
    expect(execute.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(toolParts(messages.value)[0]).toMatchObject({ state: 'result', result: { city: 'Oslo', temp: 12 } })
    expect(provider.requests[0].tools).toEqual([{ name: 'weather', description: 'Get weather', parameters: { type: 'object' } }])
    expect(provider.requests[1].messages.at(-1)).toEqual({ role: 'tool', content: '{"city":"Oslo","temp":12}', toolCallId: 'c1' })
  })

  it('pauses on calls without a result and continues after addToolResult', async () => {
    const provider = scriptedProvider(
      [...toolCall('c1', 'confirm', ['{"action":"delete"}']), { type: 'finish', finishReason: 'tool-calls' }],
      [{ type: 'text-delta', text: 'Deleted.' }, { type: 'finish', finishReason: 'stop' }],
    )
    const { messages, status, sendMessage, addToolResult } = useChat({
      provider,
      model: 'm',
      tools: [{ name: 'confirm', description: 'Ask the user', parameters: {} }],
    })

    await sendMessage('delete it')
    expect(provider.requests).toHaveLength(1)
    expect(status.value).toBe('ready')
    expect(toolParts(messages.value)[0].state).toBe('pending')

    await addToolResult({ toolCallId: 'c1', result: { confirmed: true } })

    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[1].messages.at(-1)).toEqual({ role: 'tool', content: '{"confirmed":true}', toolCallId: 'c1' })
    expect(messages.value.at(-1)!.parts.at(-1)).toMatchObject({ type: 'text', text: 'Deleted.' })
  })

  it('waits until every pending call is answered', async () => {
    const provider = scriptedProvider(
      [...toolCall('a', 'ask', ['{}']), ...toolCall('b', 'ask', ['{}']), { type: 'finish', finishReason: 'tool-calls' }],
    )
    const { sendMessage, addToolResult } = useChat({ provider, model: 'm' })

    await sendMessage('go')
    await addToolResult({ toolCallId: 'a', result: 1 })
    expect(provider.requests).toHaveLength(1)

    await addToolResult({ toolCallId: 'b', error: 'User declined' })
    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[1].messages.slice(-2)).toEqual([
      { role: 'tool', content: '1', toolCallId: 'a' },
      { role: 'tool', content: '{"error":"User declined"}', toolCallId: 'b' },
    ])
  })

  it('does not continue when autoSendToolResults is false', async () => {
    const provider = scriptedProvider(
      [...toolCall('a', 'ask', ['{}']), { type: 'finish', finishReason: 'tool-calls' }],
    )
    const { messages, sendMessage, addToolResult } = useChat({ provider, model: 'm', autoSendToolResults: false })

    await sendMessage('go')
    await addToolResult({ toolCallId: 'a', result: 'ok' })

    expect(provider.requests).toHaveLength(1)
    expect(toolParts(messages.value)[0]).toMatchObject({ state: 'result', result: 'ok' })
  })

  it('answers unresolved calls when the user moves on', async () => {
    const provider = scriptedProvider(
      [...toolCall('a', 'ask', ['{}']), { type: 'finish', finishReason: 'tool-calls' }],
    )
    const { sendMessage } = useChat({ provider, model: 'm' })

    await sendMessage('go')
    await sendMessage('never mind')

    expect(provider.requests[1].messages.slice(-2)).toEqual([
      { role: 'tool', content: '{"error":"The tool call was not answered"}', toolCallId: 'a' },
      { role: 'user', content: 'never mind' },
    ])
  })

  it('reports execute errors to the model', async () => {
    const provider = scriptedProvider(
      [...toolCall('a', 'boom', ['{}']), { type: 'finish', finishReason: 'tool-calls' }],
      [{ type: 'text-delta', text: 'Sorry' }, { type: 'finish', finishReason: 'stop' }],
    )
    const { messages, sendMessage } = useChat({
      provider,
      model: 'm',
      tools: [{ name: 'boom', description: '', parameters: {}, execute: () => { throw new Error('API down') } }],
    })

    await sendMessage('go')

    expect(toolParts(messages.value)[0]).toMatchObject({ state: 'error', error: 'API down' })
    expect(provider.requests[1].messages.at(-1)).toEqual({ role: 'tool', content: '{"error":"API down"}', toolCallId: 'a' })
  })
})

describe('tool states', () => {
  it('skips running for calls nothing can handle', async () => {
    const provider = scriptedProvider([...toolCall('a', 'ask', ['{}']), { type: 'finish', finishReason: 'tool-calls' }])
    const { messages, sendMessage } = useChat({ provider, model: 'm' })

    const states: string[] = []
    watch(messages, msgs => {
      const state = toolParts(msgs)[0]?.state
      if (state && states.at(-1) !== state) states.push(state)
    }, { flush: 'sync', deep: true })

    await sendMessage('go')
    expect(states).toEqual(['streaming', 'pending'])
  })
})
