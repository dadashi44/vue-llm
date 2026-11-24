/* eslint-disable vue/one-component-per-file */
// The Vue 3 component specs (test/components), run against the Vue 2.7 build of the same sources:
// `npm run test:vue2` aliases `vue` to Vue 2.7 and compiles .vue files with scripts/vite-plugin-vue2-sfc.ts
import { describe, it, expect } from 'vitest'
import Vue, { defineComponent, h, nextTick, reactive, type Component, type CreateElement, type PropType, type VNodeData } from 'vue2'
import MessageParts from '../../src/components/MessageParts.vue'
import StreamMarkdown from '../../src/components/StreamMarkdown.vue'
import type { UIMessage } from '../../src/types'
import type { ChatStreamChunk, LLMProvider } from '../../src/providers/types'
import { useChat } from '../../src/composables/use-chat'

const flush = () => new Promise(resolve => setTimeout(resolve))

function mount(component: unknown, props: Record<string, unknown>, data: (h: CreateElement) => VNodeData = () => ({})) {
  const state = reactive({ props })
  const vm = new Vue({
    render: h => h(component as Component, { props: state.props, ...data(h) }),
  }).$mount(document.body.appendChild(document.createElement('div')))
  return {
    el: vm.$el as HTMLElement,
    async setProps(next: Record<string, unknown>) {
      state.props = { ...state.props, ...next }
      await nextTick()
    },
  }
}

const WeatherCard = defineComponent({
  props: {
    args: { type: Object as PropType<{ city: string }>, default: undefined },
    state: { type: String, required: true },
    result: { type: Object as PropType<{ temp: number }>, default: undefined },
    addResult: { type: Function as PropType<(result: unknown) => void>, required: true },
  },
  setup(props) {
    return () => h('div', { class: 'weather' }, [
      `${props.args?.city ?? '…'} ${props.state} ${props.result?.temp ?? ''}`.trim(),
      h('button', { on: { click: () => props.addResult({ temp: 20 }) } }, 'ok'),
    ])
  },
})

const message = (parts: UIMessage['parts'], role: UIMessage['role'] = 'assistant'): UIMessage => ({ id: '1', role, parts })

describe('StreamMarkdown on Vue 2.7', () => {
  it('renders markdown safely', () => {
    const { el } = mount(StreamMarkdown, { content: '**hi** <img src=x onerror=alert(1)>' })
    expect(el.querySelector('strong')?.textContent).toBe('hi')
    expect(el.querySelector('img')).toBeNull()
  })

  it('shows the cursor only while streaming', async () => {
    const wrapper = mount(StreamMarkdown, { content: 'x', streaming: true })
    expect(wrapper.el.querySelector('.vue-llm-cursor')).not.toBeNull()
    await wrapper.setProps({ streaming: false })
    expect(wrapper.el.querySelector('.vue-llm-cursor')).toBeNull()
  })

  it('accepts a custom renderer', () => {
    const { el } = mount(StreamMarkdown, { content: 'abc', render: (md: string) => `<mark>${md}</mark>` })
    expect(el.querySelector('mark')?.textContent).toBe('abc')
  })
})

describe('MessageParts on Vue 2.7', () => {
  it('renders text as markdown and reasoning in a details block', () => {
    const { el } = mount(MessageParts, {
      message: message([
        { type: 'reasoning', text: 'thinking', state: 'done' },
        { type: 'text', text: '**bold** <script>x</script>', state: 'streaming' },
      ]),
    })
    expect(el.querySelector('details.vue-llm-reasoning')?.textContent).toContain('thinking')
    expect(el.querySelector('strong')?.textContent).toBe('bold')
    expect(el.querySelector('script')).toBeNull()
    expect(el.querySelector('.vue-llm-cursor')).not.toBeNull()
  })

  it('keeps user text as plain text', () => {
    const { el } = mount(MessageParts, { message: message([{ type: 'text', text: '**raw**' }], 'user') })
    expect(el.querySelector('.vue-llm-text')?.textContent).toBe('**raw**')
    expect(el.getAttribute('data-role')).toBe('user')
  })

  it('renders tool calls with the mapped component, emits results and keeps it mounted', async () => {
    const results: unknown[] = []
    const wrapper = mount(
      MessageParts,
      {
        message: message([{ type: 'tool-call', toolCallId: 'c1', toolName: 'weather', args: { city: 'Oslo' }, state: 'pending' }]),
        components: { weather: WeatherCard },
      },
      () => ({ on: { 'tool-result': (payload: unknown) => results.push(payload) } }),
    )
    const card = wrapper.el.querySelector('.weather')
    expect(card?.textContent).toContain('Oslo pending')

    wrapper.el.querySelector('button')?.click()
    expect(results).toEqual([{ toolCallId: 'c1', result: { temp: 20 } }])

    await wrapper.setProps({
      message: message([
        { type: 'reasoning', text: 'checked', state: 'done' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'weather', args: { city: 'Oslo' }, state: 'result', result: { temp: 20 } },
      ]),
    })
    expect(wrapper.el.querySelector('.weather')?.textContent).toContain('Oslo result 20')
    expect(wrapper.el.querySelector('.weather')).toBe(card)
  })

  it('keeps each tool component bound to its own call', async () => {
    const call = (toolCallId: string, city: string) =>
      ({ type: 'tool-call', toolCallId, toolName: 'weather', args: { city }, state: 'pending' }) as const
    const wrapper = mount(MessageParts, { message: message([call('c1', 'Oslo'), call('c2', 'Rome')]), components: { weather: WeatherCard } })
    const rome = wrapper.el.querySelectorAll('.weather')[1]

    await wrapper.setProps({ message: message([call('c2', 'Rome')]) })

    expect(wrapper.el.querySelectorAll('.weather')).toHaveLength(1)
    expect(wrapper.el.querySelector('.weather')).toBe(rome)
  })

  it('falls back to the tool slot for unmapped tools, with camelCase addResult', () => {
    let addResult: unknown
    const { el } = mount(
      MessageParts,
      { message: message([{ type: 'tool-call', toolCallId: 'c1', toolName: 'search', args: { q: 'vue' }, state: 'running' }]) },
      h => ({
        scopedSlots: {
          tool: (props: { part: { toolName: string; state: string }; addResult: unknown }) => {
            addResult = props.addResult
            return h('i', { class: 'fallback' }, `${props.part.toolName} ${props.part.state}`)
          },
        },
      }),
    )
    expect(el.querySelector('.fallback')?.textContent).toBe('search running')
    expect(addResult).toBeTypeOf('function')
  })

  it('renders data parts with the component mapped to their name', () => {
    const Chart = defineComponent({
      props: { name: { type: String, required: true }, data: { type: Object as PropType<{ values: number[] }>, required: true } },
      setup(props) {
        return () => h('div', { class: 'chart' }, `${props.name}:${props.data.values.join(',')}`)
      },
    })
    const { el } = mount(MessageParts, {
      message: message([{ type: 'data', name: 'chart', id: 'c1', data: { values: [1, 2] } }]),
      dataComponents: { chart: Chart },
    })
    expect(el.querySelector('.chart')?.textContent).toBe('chart:1,2')
  })

  it('falls back to the data slot for unmapped data parts', () => {
    const { el } = mount(
      MessageParts,
      { message: message([{ type: 'data', name: 'progress', data: { step: 2 } }]) },
      h => ({
        scopedSlots: {
          data: (props: { part: { name: string; data: { step: number } } }) => h('i', { class: 'fallback' }, `${props.part.name} ${props.part.data.step}`),
        },
      }),
    )
    expect(el.querySelector('.fallback')?.textContent).toBe('progress 2')
  })

  it('renders images and only http(s) sources', () => {
    const { el } = mount(MessageParts, {
      message: message([
        { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AA', filename: 'a.png' },
        { type: 'source', url: 'https://vuejs.org', title: 'Vue' },
        { type: 'source', url: 'javascript:alert(1)', title: 'bad' },
      ]),
    })
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('a.png')
    const links = el.querySelectorAll('a.vue-llm-source')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('https://vuejs.org')
  })
})

describe('MessageParts with useChat on Vue 2.7', () => {
  it('re-renders while the assistant message streams in place', async () => {
    const provider: LLMProvider = {
      id: 'slow',
      supportsStreaming: true,
      validateConfig() {},
      async chat() {
        const chunks: ChatStreamChunk[] = [
          { type: 'text-delta', text: 'Hello' },
          { type: 'text-delta', text: ' world' },
          { type: 'finish', finishReason: 'stop' },
        ]
        const stream = new ReadableStream<ChatStreamChunk>({
          async pull(controller) {
            await new Promise(r => setTimeout(r, 5))
            const chunk = chunks.shift()
            if (chunk) controller.enqueue(chunk)
            else controller.close()
          },
        })
        return { stream, response: Promise.resolve({ finishReason: 'stop' }) }
      },
    }

    let chat: ReturnType<typeof useChat> | undefined
    const Chat = defineComponent({
      setup() {
        const current = useChat({ provider, model: 'm' })
        chat = current
        return () => h('div', current.messages.value.map(m => h(MessageParts as Component, { key: m.id, props: { message: m } })))
      },
    })

    const { el } = mount(Chat, {})
    await chat?.sendMessage('hi')
    await flush()

    expect(el.querySelectorAll('.vue-llm-message')[1]?.textContent?.trim()).toBe('Hello world')
  })
})
