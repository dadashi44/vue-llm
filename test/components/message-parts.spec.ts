/* eslint-disable vue/one-component-per-file */
import { describe, it, expect } from 'vitest'
import { defineComponent, h, type PropType } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import MessageParts from '../../src/components/MessageParts.vue'
import type { ToolComponentProps, UIMessage } from '../../src/types'
import type { ChatStreamChunk, LLMProvider } from '../../src/providers/types'
import { useChat } from '../../src/composables/use-chat'

const WeatherCard = defineComponent({
  props: {
    args: { type: Object as PropType<ToolComponentProps<{ city: string }>['args']>, default: undefined },
    state: { type: String, required: true },
    result: { type: Object as PropType<{ temp: number }>, default: undefined },
    addResult: { type: Function as PropType<ToolComponentProps['addResult']>, required: true },
  },
  setup(props) {
    return () => h('div', { class: 'weather' }, [
      `${props.args?.city ?? '…'} ${props.state} ${props.result?.temp ?? ''}`.trim(),
      h('button', { onClick: () => props.addResult({ temp: 20 }) }, 'ok'),
    ])
  },
})

const message = (parts: UIMessage['parts'], role: UIMessage['role'] = 'assistant'): UIMessage => ({ id: '1', role, parts })

describe('MessageParts', () => {
  it('renders text as markdown and reasoning in a details block', () => {
    const wrapper = mount(MessageParts, {
      props: {
        message: message([
          { type: 'reasoning', text: 'thinking', state: 'done' },
          { type: 'text', text: '**bold** <script>x</script>', state: 'streaming' },
        ]),
      },
    })
    expect(wrapper.find('details.vue-llm-reasoning').text()).toContain('thinking')
    expect(wrapper.find('strong').text()).toBe('bold')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('.vue-llm-cursor').exists()).toBe(true)
  })

  it('keeps user text as plain text', () => {
    const wrapper = mount(MessageParts, { props: { message: message([{ type: 'text', text: '**raw**' }], 'user') } })
    expect(wrapper.find('.vue-llm-text').element.textContent).toBe('**raw**')
    expect(wrapper.attributes('data-role')).toBe('user')
  })

  it('renders tool calls with the mapped component and emits results', async () => {
    const wrapper = mount(MessageParts, {
      props: {
        message: message([
          { type: 'tool-call', toolCallId: 'c1', toolName: 'weather', args: { city: 'Oslo' }, state: 'pending' },
        ]),
        components: { weather: WeatherCard },
      },
    })
    expect(wrapper.find('.weather').text()).toContain('Oslo pending')

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('tool-result')).toEqual([[{ toolCallId: 'c1', result: { temp: 20 } }]])

    await wrapper.setProps({
      message: message([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'weather', args: { city: 'Oslo' }, state: 'result', result: { temp: 20 } },
      ]),
    })
    expect(wrapper.find('.weather').text()).toContain('Oslo result 20')
  })

  it('falls back to the tool slot for unmapped tools', () => {
    const wrapper = mount(MessageParts, {
      props: {
        message: message([{ type: 'tool-call', toolCallId: 'c1', toolName: 'search', args: { q: 'vue' }, state: 'running' }]),
      },
      slots: { tool: `<template #tool="{ part }"><i class="fallback">{{ part.toolName }} {{ part.state }}</i></template>` },
    })
    expect(wrapper.find('.fallback').text()).toBe('search running')
  })

  it('renders images and only http(s) sources', () => {
    const wrapper = mount(MessageParts, {
      props: {
        message: message([
          { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AA', filename: 'a.png' },
          { type: 'source', url: 'https://vuejs.org', title: 'Vue' },
          { type: 'source', url: 'javascript:alert(1)', title: 'bad' },
        ]),
      },
    })
    expect(wrapper.find('img').attributes('alt')).toBe('a.png')
    const links = wrapper.findAll('a.vue-llm-source')
    expect(links).toHaveLength(1)
    expect(links[0].attributes('href')).toBe('https://vuejs.org')
  })
})

describe('MessageParts with useChat', () => {
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

    const Chat = defineComponent({
      setup() {
        const chat = useChat({ provider, model: 'm' })
        return { ...chat }
      },
      render() {
        return h('div', this.messages.map(message => h(MessageParts, { key: message.id, message })))
      },
    })

    const wrapper = mount(Chat)
    await (wrapper.vm as unknown as { sendMessage: (text: string) => Promise<void> }).sendMessage('hi')
    await flushPromises()

    expect(wrapper.findAll('.vue-llm-message')[1].text()).toBe('Hello world')
  })
})
