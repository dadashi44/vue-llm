import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createGoogle } from '../../src/providers/google'
import { createOllama } from '../../src/providers/ollama'
import type { ChatMessage, ChatStreamChunk, LLMProvider } from '../../src/providers/types'

const history: ChatMessage[] = [
  { role: 'user', content: 'Weather in Paris and Rome?' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [
      { id: 'tc_1', name: 'get_weather', args: { city: 'Paris' } },
      { id: 'tc_2', name: 'get_weather', args: { city: 'Rome' } },
    ],
  },
  { role: 'tool', toolCallId: 'tc_1', content: JSON.stringify({ temp: 18 }) },
  { role: 'tool', toolCallId: 'tc_2', content: 'sunny' },
]

function streamResponse(body: string): Response {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  }), { status: 200 })
}

async function run(provider: LLMProvider, body: string, messages: ChatMessage[] = []) {
  const fetchMock = vi.fn(async () => streamResponse(body))
  globalThis.fetch = fetchMock as unknown as typeof fetch
  const { stream } = await provider.chat({ model: 'm', messages })
  const chunks: ChatStreamChunk[] = []
  const reader = stream.getReader()
  for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(r.value)
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
  return { chunks, request: JSON.parse(init.body as string) }
}

describe('tool roundtrips', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubGlobal('window', undefined)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  it('Gemini reports tool-calls when the model calls a function with STOP', async () => {
    const body = `data: ${JSON.stringify({
      candidates: [{ content: { parts: [{ functionCall: { name: 'get_weather', args: { city: 'Paris' } } }] }, finishReason: 'STOP' }],
    })}\n\n`

    const { chunks } = await run(createGoogle({ apiKey: 'k' }), body)

    expect(chunks.at(-1)).toMatchObject({ type: 'finish', finishReason: 'tool-calls' })
  })

  it('Gemini sends function responses by name, grouped in one user turn', async () => {
    const body = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] })}\n\n`

    const { request } = await run(createGoogle({ apiKey: 'k' }), body, history)

    expect(request.contents).toEqual([
      { role: 'user', parts: [{ text: 'Weather in Paris and Rome?' }] },
      {
        role: 'model',
        parts: [
          { functionCall: { name: 'get_weather', args: { city: 'Paris' } } },
          { functionCall: { name: 'get_weather', args: { city: 'Rome' } } },
        ],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'get_weather', response: { result: { temp: 18 } } } },
          { functionResponse: { name: 'get_weather', response: { result: 'sunny' } } },
        ],
      },
    ])
  })

  it('Ollama reports tool-calls and replays tool calls and results', async () => {
    const body = [
      { message: { tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'Paris' } } }] }, done: false },
      { done: true },
    ].map(l => JSON.stringify(l)).join('\n') + '\n'

    const { chunks, request } = await run(createOllama(), body, history)

    expect(chunks.at(-1)).toMatchObject({ type: 'finish', finishReason: 'tool-calls' })
    expect(request.messages.slice(1)).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { function: { name: 'get_weather', arguments: { city: 'Paris' } } },
          { function: { name: 'get_weather', arguments: { city: 'Rome' } } },
        ],
      },
      { role: 'tool', content: '{"temp":18}', tool_name: 'get_weather' },
      { role: 'tool', content: 'sunny', tool_name: 'get_weather' },
    ])
  })

  it('Ollama still reports stop for plain text', async () => {
    const body = [{ message: { content: 'hi' }, done: false }, { done: true }].map(l => JSON.stringify(l)).join('\n') + '\n'
    const { chunks } = await run(createOllama(), body)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', finishReason: 'stop' })
  })
})
