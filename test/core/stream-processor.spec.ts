import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import type { ChatStatus, UIMessage } from '../../src/types'
import type { ChatStreamChunk } from '../../src/providers/types'
import { StreamProcessor } from '../../src/core/stream-processor'

function createStream(chunks: ChatStreamChunk[]): ReadableStream<ChatStreamChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe('StreamProcessor', () => {
  it('accumulates text deltas into a single text part', async () => {
    const messages = ref<UIMessage[]>([])
    const status = ref<ChatStatus>('ready')
    const processor = new StreamProcessor(messages, status, () => 'test-id')

    const stream = createStream([
      { type: 'text-delta', text: 'Hello' },
      { type: 'text-delta', text: ' world' },
      { type: 'finish', finishReason: 'stop' },
    ])

    await processor.processStream(stream, new AbortController().signal, {})

    expect(messages.value).toHaveLength(1)
    expect(messages.value[0].role).toBe('assistant')
    expect(messages.value[0].parts).toHaveLength(1)
    expect(messages.value[0].parts[0]).toMatchObject({
      type: 'text',
      text: 'Hello world',
      state: 'done',
    })
  })

  it('updates status through streaming lifecycle', async () => {
    const messages = ref<UIMessage[]>([])
    const status = ref<ChatStatus>('submitted')
    const processor = new StreamProcessor(messages, status, () => 'test-id')

    const stream = createStream([
      { type: 'text-delta', text: 'Hi' },
      { type: 'finish', finishReason: 'stop' },
    ])

    await processor.processStream(stream, new AbortController().signal, {})

    expect(messages.value).toHaveLength(1)
    expect(messages.value[0].parts[0]).toMatchObject({ type: 'text', text: 'Hi', state: 'done' })
  })

  it('calls onFinish callback', async () => {
    const messages = ref<UIMessage[]>([])
    const status = ref<ChatStatus>('ready')
    const processor = new StreamProcessor(messages, status, () => 'test-id')
    const onFinish = vi.fn()

    const stream = createStream([
      { type: 'text-delta', text: 'Done' },
      { type: 'finish', finishReason: 'stop' },
    ])

    await processor.processStream(stream, new AbortController().signal, { onFinish })

    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish.mock.calls[0][0].parts[0].text).toBe('Done')
    expect(onFinish.mock.calls[0][1].finishReason).toBe('stop')
  })

  it('handles tool call chunks', async () => {
    const messages = ref<UIMessage[]>([])
    const status = ref<ChatStatus>('ready')
    const processor = new StreamProcessor(messages, status, () => 'test-id')

    const stream = createStream([
      { type: 'text-delta', text: 'Let me check ' },
      { type: 'tool-call-start', toolCallId: 'tc_1', toolName: 'get_weather' },
      { type: 'tool-call-delta', toolCallId: 'tc_1', args: '{"city":' },
      { type: 'tool-call-delta', toolCallId: 'tc_1', args: '"London"}' },
      { type: 'tool-call-end', toolCallId: 'tc_1' },
      { type: 'finish', finishReason: 'tool-calls' },
    ])

    const result = await processor.processStream(stream, new AbortController().signal, {})

    const msg = messages.value[0]
    expect(msg.parts).toHaveLength(2)
    expect(msg.parts[0]).toMatchObject({ type: 'text', text: 'Let me check ' })
    expect(msg.parts[1]).toMatchObject({ type: 'tool-call', toolCallId: 'tc_1', toolName: 'get_weather' })
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].args).toEqual({ city: 'London' })
  })

  it('handles reasoning deltas', async () => {
    const messages = ref<UIMessage[]>([])
    const status = ref<ChatStatus>('ready')
    const processor = new StreamProcessor(messages, status, () => 'test-id')

    const stream = createStream([
      { type: 'reasoning-delta', text: 'thinking...' },
      { type: 'text-delta', text: 'answer' },
      { type: 'finish', finishReason: 'stop' },
    ])

    await processor.processStream(stream, new AbortController().signal, {})

    expect(messages.value[0].parts).toHaveLength(2)
    expect(messages.value[0].parts[0]).toMatchObject({ type: 'reasoning', text: 'thinking...', state: 'done' })
    expect(messages.value[0].parts[1]).toMatchObject({ type: 'text', text: 'answer', state: 'done' })
  })
})
