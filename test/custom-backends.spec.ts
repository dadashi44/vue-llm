import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSSEProvider } from '../src/providers/sse'
import { createLLMHandler, createProxyProvider } from '../src/server'
import { useChat } from '../src/composables/use-chat'
import { LLMAPIError } from '../src/core/errors'
import type { ChatMessage, ChatRequest, ChatStreamChunk, LLMProvider } from '../src/providers/types'

function sse(events: { event?: string; data: unknown }[]): Response {
  const body = events
    .map(e => (e.event ? `event: ${e.event}\n` : '') + `data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`)
    .join('')
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function scriptedProvider(rounds: ChatStreamChunk[][]): LLMProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  return {
    id: 'scripted',
    supportsStreaming: true,
    validateConfig: () => {},
    requests,
    chat: vi.fn(async (request: ChatRequest) => {
      requests.push(structuredClone({ ...request, signal: undefined }))
      const chunks = rounds[requests.length - 1] ?? []
      return {
        stream: new ReadableStream<ChatStreamChunk>({
          start(c) {
            chunks.forEach(chunk => c.enqueue(chunk))
            c.close()
          },
        }),
        response: Promise.resolve({ finishReason: 'stop' as const }),
      }
    }),
  }
}

const toolRound: ChatStreamChunk[] = [
  { type: 'text-delta', text: 'Checking. ' },
  { type: 'tool-call-start', toolCallId: 'call_1', toolName: 'get_standings' },
  { type: 'tool-call-delta', toolCallId: 'call_1', args: '{"tournament":42}' },
  { type: 'tool-call-end', toolCallId: 'call_1' },
  { type: 'finish', finishReason: 'tool-calls' },
]
const answerRound: ChatStreamChunk[] = [
  { type: 'text-delta', text: 'Team A leads.' },
  { type: 'finish', finishReason: 'stop' },
]

async function readSSE(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text()
  return text.split('\n\n').filter(Boolean).map(e => e.replace(/^data: /, '')).filter(d => d !== '[DONE]').map(d => JSON.parse(d))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createSSEProvider', () => {
  it('maps a custom backend protocol with server-side tools into UI parts', async () => {
    const fetchMock = vi.fn(async () => sse([
      { event: 'thinking', data: { text: 'Need standings' } },
      { event: 'tool_use', data: { id: 't1', name: 'get_standings', input: { tournament: 42 } } },
      { event: 'tool_result', data: { tool_use_id: 't1', output: [{ team: 'A', points: 9 }] } },
      { event: 'text_delta', data: { text: 'Team A leads.' } },
      { event: 'done', data: {} },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createSSEProvider({
      url: req => `/api/ai-chat/sessions/${(req.providerOptions as { sessionId: string }).sessionId}/stream`,
      headers: async () => ({ Authorization: 'Bearer t' }),
      body: req => ({ message: req.messages.at(-1)?.content }),
      mapEvent: ({ event, json }) => {
        const d = json as Record<string, never>
        switch (event) {
          case 'thinking': return { type: 'reasoning-delta', text: d.text }
          case 'tool_use': return [
            { type: 'tool-call-start', toolCallId: d.id, toolName: d.name },
            { type: 'tool-call-delta', toolCallId: d.id, args: JSON.stringify(d.input) },
            { type: 'tool-call-end', toolCallId: d.id },
          ]
          case 'tool_result': return { type: 'tool-result', toolCallId: d.tool_use_id, result: d.output }
          case 'text_delta': return { type: 'text-delta', text: d.text }
          case 'done': return { type: 'finish', finishReason: 'stop' }
        }
      },
    })

    const onToolCall = vi.fn(({ toolName }: { toolName: string }) => (toolName === 'client_only' ? 'x' : undefined))
    const { messages, sendMessage } = useChat({ provider, model: 'any', body: { sessionId: 's9' }, onToolCall })
    await sendMessage('Who leads?')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai-chat/sessions/s9/stream')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer t')
    expect(JSON.parse(init.body as string)).toEqual({ message: 'Who leads?' })

    expect(messages.value[1].parts).toMatchObject([
      { type: 'reasoning', text: 'Need standings', state: 'done' },
      { type: 'tool-call', toolName: 'get_standings', args: { tournament: 42 }, state: 'result', result: [{ team: 'A', points: 9 }] },
      { type: 'text', text: 'Team A leads.' },
    ])
    // the server already resolved the call, so no client roundtrip is made
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('accepts vue-llm chunks by default and finishes when the stream ends', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([{ data: { type: 'text-delta', text: 'hi' } }, { data: 'not json' }])))
    const { stream, response } = await createSSEProvider({ url: '/x' }).chat({ model: 'm', messages: [] })

    const chunks: ChatStreamChunk[] = []
    const reader = stream.getReader()
    for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(r.value)

    expect(chunks).toEqual([{ type: 'text-delta', text: 'hi' }, { type: 'finish', finishReason: 'stop' }])
    await expect(response).resolves.toEqual({ finishReason: 'stop' })
  })

  it('throws LLMAPIError for HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })))
    const error = await createSSEProvider({ url: '/x', id: 'admin' }).chat({ model: 'm', messages: [] }).catch(e => e)
    expect(error).toBeInstanceOf(LLMAPIError)
    expect(error).toMatchObject({ status: 403, provider: 'admin' })
  })
})

describe('createLLMHandler server tools', () => {
  const post = (handler: (r: Request) => Promise<Response>, messages: ChatMessage[]) =>
    handler(new Request('http://x/api/chat', { method: 'POST', body: JSON.stringify({ messages }) }))

  it('executes tools on the server and continues the conversation', async () => {
    const provider = scriptedProvider([toolRound, answerRound])
    const execute = vi.fn(async (args: unknown) => ({ leader: 'A', args }))
    const handler = createLLMHandler({
      provider,
      tools: [{ name: 'get_standings', description: 'd', parameters: {}, execute }],
    })

    const events = await readSSE(await post(handler, [{ role: 'user', content: 'Who leads?' }]))

    expect(execute).toHaveBeenCalledWith({ tournament: 42 }, expect.objectContaining({ toolCallId: 'call_1' }))
    expect(events.map(e => e.type)).toEqual([
      'text-delta', 'tool-call-start', 'tool-call-delta', 'tool-call-end', 'tool-result', 'text-delta', 'finish',
    ])
    expect(events.at(-1)).toEqual({ type: 'finish', finishReason: 'stop' })
    expect(events[4]).toEqual({ type: 'tool-result', toolCallId: 'call_1', result: { leader: 'A', args: { tournament: 42 } } })

    expect(provider.requests[0].tools).toEqual([{ name: 'get_standings', description: 'd', parameters: {} }])
    expect(provider.requests[1].messages.slice(1)).toEqual([
      { role: 'assistant', content: 'Checking. ', toolCalls: [{ id: 'call_1', name: 'get_standings', args: { tournament: 42 } }] },
      { role: 'tool', toolCallId: 'call_1', content: JSON.stringify({ leader: 'A', args: { tournament: 42 } }) },
    ])
  })

  it('reports tool errors to the client and the model', async () => {
    const provider = scriptedProvider([toolRound, answerRound])
    const handler = createLLMHandler({
      provider,
      tools: [{ name: 'get_standings', description: 'd', parameters: {}, execute: () => { throw new Error('db down') } }],
    })

    const events = await readSSE(await post(handler, [{ role: 'user', content: 'x' }]))

    expect(events).toContainEqual({ type: 'tool-result', toolCallId: 'call_1', error: 'db down' })
    expect(provider.requests[1].messages.at(-1)).toEqual({ role: 'tool', toolCallId: 'call_1', content: '{"error":"db down"}' })
  })

  it('leaves tools without execute to the client', async () => {
    const provider = scriptedProvider([toolRound])
    const handler = createLLMHandler({ provider, tools: [{ name: 'get_standings', description: 'd', parameters: {} }] })

    const events = await readSSE(await post(handler, [{ role: 'user', content: 'x' }]))

    expect(events.at(-1)).toEqual({ type: 'finish', finishReason: 'tool-calls' })
    expect(events.some(e => e.type === 'tool-result')).toBe(false)
    expect(provider.chat).toHaveBeenCalledTimes(1)
  })

  it('stops after maxToolRoundtrips', async () => {
    const provider = scriptedProvider([toolRound, toolRound, toolRound])
    const handler = createLLMHandler({
      provider,
      maxToolRoundtrips: 1,
      tools: [{ name: 'get_standings', description: 'd', parameters: {}, execute: () => 1 }],
    })

    const events = await readSSE(await post(handler, [{ role: 'user', content: 'x' }]))

    expect(provider.chat).toHaveBeenCalledTimes(2)
    expect(events.at(-1)).toEqual({ type: 'finish', finishReason: 'tool-calls' })
  })

  it('works end to end: useChat → proxy → handler with a server tool', async () => {
    const provider = scriptedProvider([toolRound, answerRound])
    const handler = createLLMHandler({
      provider,
      tools: [{ name: 'get_standings', description: 'd', parameters: {}, execute: () => ({ leader: 'A' }) }],
    })
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => handler(new Request(`http://x${url}`, init))))

    const { messages, sendMessage } = useChat({ provider: createProxyProvider('/api/chat'), model: 'm' })
    await sendMessage('Who leads?')

    expect(messages.value[1].parts).toMatchObject([
      { type: 'text', text: 'Checking. ' },
      { type: 'tool-call', toolName: 'get_standings', state: 'result', result: { leader: 'A' }, args: { tournament: 42 } },
      { type: 'text', text: 'Team A leads.' },
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
