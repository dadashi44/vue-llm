import { describe, it, expect, expectTypeOf, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { createChatPrompt, createPrompt, type PromptVariables } from '../../src/core/prompt'
import { usePrompt } from '../../src/composables/use-prompt'
import { useChat } from '../../src/composables/use-chat'
import type { ChatStreamChunk, LLMProvider } from '../../src/providers/types'

describe('createPrompt', () => {
  it('renders variables with optional whitespace', () => {
    const prompt = createPrompt('Translate {{ text }} to {{lang}}.')
    expect(prompt.render({ text: 'hello', lang: 'French' })).toBe('Translate hello to French.')
    expect(prompt.variables).toEqual(['text', 'lang'])
  })

  it('stringifies numbers and booleans, repeats variables', () => {
    const prompt = createPrompt('{{n}} + {{n}} = {{ok}}')
    expect(prompt.render({ n: 2, ok: true })).toBe('2 + 2 = true')
  })

  it('applies defaults and lets explicit values win', () => {
    const prompt = createPrompt('You speak {{lang}} in a {{tone}} tone.', { defaults: { tone: 'friendly' } })
    expect(prompt.render({ lang: 'English' })).toBe('You speak English in a friendly tone.')
    expect(prompt.render({ lang: 'English', tone: 'formal' })).toBe('You speak English in a formal tone.')
  })

  it('throws on missing variables', () => {
    const prompt = createPrompt('Hi {{name}}')
    expect(() => prompt.render({} as never)).toThrow('Missing prompt variable "name"')
  })

  it('keeps escaped placeholders literal', () => {
    const prompt = createPrompt('Use \\{{name}} syntax, {{name}}')
    expect(prompt.render({ name: 'Ann' })).toBe('Use {{name}} syntax, Ann')
    expect(prompt.variables).toEqual(['name'])
  })

  it('requires variables without defaults at the type level', () => {
    const prompt = createPrompt('{{a}} {{b}}', { defaults: { b: 'x' } })
    // @ts-expect-error a is required
    expect(() => prompt.render({})).toThrow()
    // @ts-expect-error unknown variable
    expect(prompt.render({ a: 1, c: 2 })).toBe('1 x')
  })

  it('infers variable names from the template literal', () => {
    expectTypeOf<PromptVariables<'Hi {{ name }}, you are {{age}}'>>().toEqualTypeOf<{ name: string | number | boolean; age: string | number | boolean }>()
    expectTypeOf<PromptVariables<'no vars'>>().toEqualTypeOf<Record<string, never>>()
    expectTypeOf<PromptVariables<string>>().toEqualTypeOf<Record<string, string | number | boolean>>()
  })
})

describe('createChatPrompt', () => {
  const prompt = createChatPrompt([
    { role: 'system', content: 'You are a {{role}}.' },
    { role: 'user', content: 'Explain {{topic}} to a {{role}}.' },
  ])

  it('renders every message and collects unique variables', () => {
    expect(prompt.variables).toEqual(['role', 'topic'])
    expect(prompt.render({ role: 'teacher', topic: 'gravity' })).toEqual([
      { role: 'system', content: 'You are a teacher.' },
      { role: 'user', content: 'Explain gravity to a teacher.' },
    ])
  })

  it('produces UIMessages usable as initialMessages', () => {
    const messages = prompt.toUIMessages({ role: 'teacher', topic: 'gravity' })
    expect(messages[1]).toMatchObject({
      role: 'user',
      parts: [{ type: 'text', text: 'Explain gravity to a teacher.', state: 'done' }],
    })
    expect(messages[0].id).not.toBe(messages[1].id)
  })
})

describe('usePrompt', () => {
  it('re-renders when reactive variables change', async () => {
    const name = ref('Ann')
    const text = usePrompt('Hello {{name}}', () => ({ name: name.value }))

    expect(text.value).toBe('Hello Ann')
    name.value = 'Bob'
    await nextTick()
    expect(text.value).toBe('Hello Bob')
  })

  it('accepts a prebuilt template', () => {
    const template = createPrompt('Hi {{x}}')
    expect(usePrompt(template, { x: 1 }).value).toBe('Hi 1')
  })
})

describe('reactive system prompt', () => {
  it('useChat reads system from a getter on every request', async () => {
    const provider: LLMProvider = {
      id: 'mock',
      supportsStreaming: true,
      validateConfig: vi.fn(),
      chat: vi.fn(async () => ({
        stream: new ReadableStream<ChatStreamChunk>({
          start(c) {
            c.enqueue({ type: 'finish', finishReason: 'stop' })
            c.close()
          },
        }),
        response: Promise.resolve({ finishReason: 'stop' as const }),
      })),
    }
    const lang = ref('English')
    const system = usePrompt('Reply in {{lang}}.', () => ({ lang: lang.value }))
    const { sendMessage } = useChat({ provider, model: 'm', system })

    await sendMessage('hi')
    lang.value = 'Spanish'
    await sendMessage('hola')

    const calls = vi.mocked(provider.chat).mock.calls
    expect(calls[0][0].messages[0]).toEqual({ role: 'system', content: 'Reply in English.' })
    expect(calls[1][0].messages[0]).toEqual({ role: 'system', content: 'Reply in Spanish.' })
  })

  it('useChat sends system messages from a chat template as the system prompt', async () => {
    const provider: LLMProvider = {
      id: 'mock',
      supportsStreaming: true,
      validateConfig: vi.fn(),
      chat: vi.fn(async () => ({
        stream: new ReadableStream<ChatStreamChunk>({
          start(c) {
            c.enqueue({ type: 'finish', finishReason: 'stop' })
            c.close()
          },
        }),
        response: Promise.resolve({ finishReason: 'stop' as const }),
      })),
    }
    const tutor = createChatPrompt([{ role: 'system', content: 'You are a {{level}} tutor.' }])
    const { sendMessage } = useChat({
      provider,
      model: 'm',
      system: 'Be brief.',
      initialMessages: tutor.toUIMessages({ level: 'patient' }),
    })

    await sendMessage('hi')

    const sent = vi.mocked(provider.chat).mock.calls[0][0].messages
    expect(sent[0]).toEqual({ role: 'system', content: 'Be brief.\n\nYou are a patient tutor.' })
    expect(sent.filter(m => m.role === 'system')).toHaveLength(1)
  })
})
