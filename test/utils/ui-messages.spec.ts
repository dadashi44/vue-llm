import { describe, it, expect } from 'vitest'
import { toUIMessages } from '../../src/utils/ui-messages'
import type { ToolCallState, UIMessage } from '../../src/types'

const assistant = (parts: UIMessage['parts'], extra: Partial<UIMessage> = {}): UIMessage => ({ id: 'a1', role: 'assistant', parts, ...extra })

describe('toUIMessages', () => {
  it('copies text, reasoning and file parts as they are', () => {
    const parts: UIMessage['parts'] = [
      { type: 'reasoning', text: 'thinking', state: 'done' },
      { type: 'text', text: 'Hello', state: 'streaming' },
      { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,aGk=', filename: 'a.png' },
    ]

    expect(toUIMessages([assistant(parts)])[0].parts).toEqual(parts)
  })

  it('keeps id, role and metadata', () => {
    const [message] = toUIMessages([{ id: 'u1', role: 'user', parts: [], metadata: { messageId: 42 } }])

    expect(message).toEqual({ id: 'u1', role: 'user', parts: [], metadata: { messageId: 42 } })
  })

  it('turns a tool call into an AI SDK tool part named after the tool', () => {
    const [message] = toUIMessages([assistant([{
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'get_weather',
      args: { city: 'Oslo' },
      state: 'result',
      result: { temp: 12 },
    }])])

    expect(message.parts).toEqual([{
      type: 'tool-get_weather',
      toolCallId: 'c1',
      state: 'output-available',
      input: { city: 'Oslo' },
      output: { temp: 12 },
    }])
  })

  it.each<[ToolCallState, string]>([
    ['streaming', 'input-streaming'],
    ['pending', 'input-available'],
    ['running', 'input-available'],
    ['result', 'output-available'],
    ['error', 'output-error'],
  ])('maps tool state %s to %s', (state, expected) => {
    const [message] = toUIMessages([assistant([{ type: 'tool-call', toolCallId: 'c1', toolName: 'search', args: {}, state }])])

    expect(message.parts[0]).toMatchObject({ state: expected })
  })

  it('puts a tool error into errorText', () => {
    const [message] = toUIMessages([assistant([{ type: 'tool-call', toolCallId: 'c1', toolName: 'search', args: { q: 'x' }, state: 'error', error: 'Timed out' }])])

    expect(message.parts[0]).toEqual({ type: 'tool-search', toolCallId: 'c1', state: 'output-error', input: { q: 'x' }, errorText: 'Timed out' })
  })

  it('turns sources into source-url parts', () => {
    const [message] = toUIMessages([assistant([{ type: 'source', url: 'https://vuejs.org', title: 'Vue' }])])

    expect(message.parts).toEqual([{ type: 'source-url', sourceId: 'https://vuejs.org', url: 'https://vuejs.org', title: 'Vue' }])
  })

  it('turns data parts into data-<name> parts', () => {
    const [message] = toUIMessages([assistant([
      { type: 'data', name: 'chart', id: 'c1', data: { values: [1, 2] } },
      { type: 'data', name: 'progress', data: 'half' },
    ])])

    expect(message.parts).toEqual([
      { type: 'data-chart', id: 'c1', data: { values: [1, 2] } },
      { type: 'data-progress', data: 'half' },
    ])
  })

  it('does not change the messages it reads', () => {
    const messages = [assistant([{ type: 'tool-call', toolCallId: 'c1', toolName: 'search', args: {}, state: 'running' }])]
    const before = JSON.parse(JSON.stringify(messages))

    toUIMessages(messages)

    expect(messages).toEqual(before)
  })
})
