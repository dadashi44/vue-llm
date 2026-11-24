import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useChat } from '../../src/composables/use-chat'
import { defineTool } from '../../src/types'
import type { ChatRequest, ChatStreamChunk, LLMProvider } from '../../src/providers/types'

function scriptedProvider(...scripts: ChatStreamChunk[][]): LLMProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  return {
    id: 'scripted',
    supportsStreaming: true,
    requests,
    validateConfig() {},
    async chat(request) {
      requests.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })))
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

const call: ChatStreamChunk[] = [
  { type: 'tool-call-start', toolCallId: 'c1', toolName: 'ping' },
  { type: 'tool-call-delta', toolCallId: 'c1', args: '{}' },
  { type: 'tool-call-end', toolCallId: 'c1' },
  { type: 'finish', finishReason: 'tool-calls' },
]

const makeTool = (execute = vi.fn(async () => 'pong')) =>
  defineTool({ name: 'ping', description: 'Ping', parameters: { type: 'object' }, execute })

describe('reactive tools in useChat', () => {
  it('uses tools added after setup', async () => {
    const execute = vi.fn(async () => 'pong')
    const tools = ref<ReturnType<typeof makeTool>[]>([])
    const provider = scriptedProvider(call)
    const { sendMessage } = useChat({ provider, model: 'm', tools })

    tools.value.push(makeTool(execute))
    await sendMessage('go')

    expect(provider.requests[0]!.tools?.map(t => t.name)).toEqual(['ping'])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('accepts a getter', async () => {
    const execute = vi.fn(async () => 'pong')
    const list = [makeTool(execute)]
    const provider = scriptedProvider(call)
    const { sendMessage } = useChat({ provider, model: 'm', tools: () => list })

    await sendMessage('go')

    expect(provider.requests[0]!.tools?.map(t => t.name)).toEqual(['ping'])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('plain arrays still work', async () => {
    const execute = vi.fn(async () => 'pong')
    const provider = scriptedProvider(call)
    const { sendMessage } = useChat({ provider, model: 'm', tools: [makeTool(execute)] })

    await sendMessage('go')

    expect(provider.requests[0]!.tools?.map(t => t.name)).toEqual(['ping'])
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
