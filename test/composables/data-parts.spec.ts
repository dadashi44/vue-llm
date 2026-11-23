import { describe, it, expect } from 'vitest'
import { useChat } from '../../src/composables/use-chat'
import type { ChatRequest, ChatStreamChunk, LLMProvider } from '../../src/providers/types'

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

describe('data parts', () => {
  it('are added to the answer where they arrive in the stream', async () => {
    const { messages, sendMessage } = useChat({
      provider: scriptedProvider([
        { type: 'text-delta', text: 'Here is the chart:' },
        { type: 'data', name: 'chart', data: { kind: 'bar', values: [3, 5] } },
        { type: 'text-delta', text: 'Team A leads.' },
        { type: 'finish', finishReason: 'stop' },
      ]),
      model: 'm',
    })

    await sendMessage('Stats?')

    expect(messages.value[1].parts).toEqual([
      { type: 'text', text: 'Here is the chart:', state: 'done' },
      { type: 'data', name: 'chart', data: { kind: 'bar', values: [3, 5] } },
      { type: 'text', text: 'Team A leads.', state: 'done' },
    ])
  })

  it('with the same name and id replace the data in place', async () => {
    const { messages, sendMessage } = useChat({
      provider: scriptedProvider([
        { type: 'data', name: 'progress', id: 'sql', data: { step: 'running query' } },
        { type: 'text-delta', text: 'Working…' },
        { type: 'data', name: 'progress', id: 'sql', data: { step: 'done', rows: 12 } },
        { type: 'finish', finishReason: 'stop' },
      ]),
      model: 'm',
    })

    await sendMessage('Run it')

    expect(messages.value[1].parts).toEqual([
      { type: 'data', name: 'progress', id: 'sql', data: { step: 'done', rows: 12 } },
      { type: 'text', text: 'Working…', state: 'done' },
    ])
  })

  it('with a different name or without an id are separate parts', async () => {
    const { messages, sendMessage } = useChat({
      provider: scriptedProvider([
        { type: 'data', name: 'chart', id: '1', data: 'a' },
        { type: 'data', name: 'table', id: '1', data: 'b' },
        { type: 'data', name: 'note', data: 'c' },
        { type: 'data', name: 'note', data: 'd' },
        { type: 'finish', finishReason: 'stop' },
      ]),
      model: 'm',
    })

    await sendMessage('Go')

    expect(messages.value[1].parts.map(p => p.type === 'data' && p.data)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('are not sent to the model', async () => {
    const provider = scriptedProvider(
      [
        { type: 'text-delta', text: 'Answer' },
        { type: 'data', name: 'chart', data: { secret: 'ui only' } },
        { type: 'finish', finishReason: 'stop' },
      ],
      [{ type: 'finish', finishReason: 'stop' }],
    )
    const { sendMessage } = useChat({ provider, model: 'm' })

    await sendMessage('First')
    await sendMessage('Second')

    expect(provider.requests[1].messages).toEqual([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Answer' },
      { role: 'user', content: 'Second' },
    ])
  })
})
