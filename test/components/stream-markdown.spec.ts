import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StreamMarkdown from '../../src/components/StreamMarkdown.vue'

describe('StreamMarkdown', () => {
  it('renders markdown safely', () => {
    const wrapper = mount(StreamMarkdown, { props: { content: '**hi** <img src=x onerror=alert(1)>' } })
    expect(wrapper.find('strong').text()).toBe('hi')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('shows the cursor only while streaming', async () => {
    const wrapper = mount(StreamMarkdown, { props: { content: 'x', streaming: true } })
    expect(wrapper.find('.vue-llm-cursor').exists()).toBe(true)
    await wrapper.setProps({ streaming: false })
    expect(wrapper.find('.vue-llm-cursor').exists()).toBe(false)
  })

  it('accepts a custom renderer', () => {
    const wrapper = mount(StreamMarkdown, { props: { content: 'abc', render: (md: string) => `<mark>${md}</mark>` } })
    expect(wrapper.find('mark').text()).toBe('abc')
  })
})
