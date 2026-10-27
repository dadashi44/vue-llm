import { describe, it, expect, vi, afterEach } from 'vitest'
import { createApp, defineComponent, h, nextTick, version } from 'vue'
import { getDevtoolsBridge, setDevtoolsBridge, tracedChat, type DevtoolsEvent } from '../src/core/devtools'
import { useChat } from '../src/composables/use-chat'
import type { ChatStreamChunk, LLMProvider } from '../src/providers/types'

const devtools = vi.hoisted(() => {
  const state = {
    setup: undefined as undefined | ((api: unknown) => void),
  }
  return state
})

vi.mock('@vue/devtools-api', () => ({
  setupDevtoolsPlugin: (_descriptor: unknown, setup: (api: unknown) => void) => {
    devtools.setup = setup
  },
}))

function provider(chunks: ChatStreamChunk[], usage = { promptTokens: 5, completionTokens: 7, totalTokens: 12 }): LLMProvider {
  return {
    id: 'fake',
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
        response: Promise.resolve({ finishReason: 'stop', usage }),
      }
    },
  }
}

async function drain(stream: ReadableStream<ChatStreamChunk>): Promise<void> {
  const reader = stream.getReader()
  while (!(await reader.read()).done) { /* drain */ }
}

afterEach(() => setDevtoolsBridge(undefined))

describe('devtools bridge', () => {
  it('is a plain provider call without devtools', async () => {
    const p = provider([{ type: 'finish', finishReason: 'stop' }])
    const chat = vi.spyOn(p, 'chat')
    const result = await tracedChat(p, { model: 'm', messages: [] }, 's1')
    expect(chat).toHaveBeenCalledOnce()
    expect(result).toBe(await chat.mock.results[0].value)
  })

  it('reports the request lifecycle', async () => {
    const events: DevtoolsEvent[] = []
    setDevtoolsBridge({ emit: e => events.push(e) })

    const result = await tracedChat(provider([
      { type: 'text-delta', text: 'Hi' },
      { type: 'tool-call-start', toolCallId: 'c1', toolName: 'weather' },
      { type: 'tool-call-delta', toolCallId: 'c1', args: '{"city":' },
      { type: 'tool-call-delta', toolCallId: 'c1', args: '"Oslo"}' },
      { type: 'tool-call-end', toolCallId: 'c1' },
      { type: 'tool-result', toolCallId: 'c1', result: 12 },
      { type: 'finish', finishReason: 'stop' },
    ]), { model: 'gpt', messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 'weather', description: '', parameters: {} }] }, 's1')
    await drain(result.stream)

    expect(events.map(e => e.type)).toEqual(['request-start', 'first-chunk', 'tool-call', 'tool-result', 'request-end'])
    expect(events[0]).toMatchObject({ providerId: 'fake', model: 'gpt', tools: ['weather'], sessionId: 's1' })
    expect(events[2]).toMatchObject({ toolName: 'weather', args: '{"city":"Oslo"}' })
    expect(events[4]).toMatchObject({ finishReason: 'stop', textLength: 2, usage: { totalTokens: 12 } })
  })

  it('reports provider errors', async () => {
    const events: DevtoolsEvent[] = []
    setDevtoolsBridge({ emit: e => events.push(e) })
    const failing: LLMProvider = { ...provider([]), chat: async () => { throw new Error('401') } }

    await expect(tracedChat(failing, { model: 'm', messages: [] }, 's1')).rejects.toThrow('401')
    expect(events.at(-1)).toMatchObject({ type: 'request-error', aborted: false, error: new Error('401') })
  })
})

// The plugin needs a Vue 3 app; the bridge above also runs on Vue 2.7
describe.skipIf(version.startsWith('2.'))('LLMDevtools plugin', () => {
  it('shows sessions in the inspector and requests on the timeline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const { LLMDevtools } = await import('../src/devtools')

    const handlers: Record<string, (payload: Record<string, unknown>) => void> = {}
    const api = {
      addInspector: vi.fn(),
      addTimelineLayer: vi.fn(),
      addTimelineEvent: vi.fn(),
      sendInspectorTree: vi.fn(),
      sendInspectorState: vi.fn(),
      on: {
        getInspectorTree: (fn: (p: Record<string, unknown>) => void) => { handlers.tree = fn },
        getInspectorState: (fn: (p: Record<string, unknown>) => void) => { handlers.state = fn },
      },
    }

    let chat!: ReturnType<typeof useChat>
    const app = createApp(defineComponent({
      setup() {
        chat = useChat({
          id: 'chat-1',
          provider: provider([{ type: 'text-delta', text: 'Hello' }, { type: 'finish', finishReason: 'stop' }]),
          model: 'gpt-4o',
        })
        return () => h('div')
      },
    }))
    app.use(LLMDevtools)
    devtools.setup!(api)
    expect(getDevtoolsBridge()).toBeDefined()
    app.mount(document.createElement('div'))

    await chat.sendMessage('hi')
    await nextTick()
    vi.advanceTimersByTime(150)
    vi.useRealTimers()

    expect(api.addInspector).toHaveBeenCalledWith(expect.objectContaining({ id: 'vue-llm', label: 'LLM' }))
    expect(api.sendInspectorTree).toHaveBeenCalled()

    const tree: Record<string, unknown> = { inspectorId: 'vue-llm', filter: '' }
    handlers.tree(tree)
    expect(tree.rootNodes).toEqual([
      expect.objectContaining({ id: 'chat-1', label: 'useChat #chat-1', tags: [expect.objectContaining({ label: 'ready' }), expect.objectContaining({ label: 'gpt-4o' })] }),
    ])

    const state: Record<string, unknown> = { inspectorId: 'vue-llm', nodeId: 'chat-1' }
    handlers.state(state)
    const sections = state.state as Record<string, { key: string; value: unknown }[]>
    expect(sections.state).toContainEqual({ key: 'model', value: 'gpt-4o' })
    expect(sections.usage).toContainEqual({ key: 'requests', value: 1 })
    expect(sections.usage).toContainEqual({ key: 'completion tokens', value: 7 })
    expect(sections.messages.map(m => m.key)).toEqual(['0 user', '1 assistant'])

    const titles = api.addTimelineEvent.mock.calls.map(([{ event }]) => event.title)
    expect(titles).toEqual(['request', 'first token', 'finish'])
    expect(api.addTimelineEvent.mock.calls[2][0].event.subtitle).toContain('12 tokens')

    app.unmount()
    handlers.tree(tree)
    expect(tree.rootNodes).toEqual([])
  })
})
