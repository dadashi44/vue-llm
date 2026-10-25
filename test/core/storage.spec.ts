import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryStorage, createWebStorage, type ChatStorage } from '../../src/core/storage'
import { useChat } from '../../src/composables/use-chat'
import type { LLMProvider, ChatStreamChunk } from '../../src/providers/types'
import type { UIMessage } from '../../src/types'

function createMockProvider(chunks: ChatStreamChunk[]): LLMProvider {
  return {
    id: 'mock',
    supportsStreaming: true,
    validateConfig: vi.fn(),
    chat: vi.fn(async () => ({
      stream: new ReadableStream<ChatStreamChunk>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk)
          controller.close()
        },
      }),
      response: Promise.resolve({ finishReason: 'stop' as const }),
    })),
  }
}

const stored: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }], createdAt: new Date('2026-01-01T00:00:00Z') },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
]

describe('createWebStorage', () => {
  it('round-trips messages and revives createdAt as Date', () => {
    const storage = createWebStorage()
    storage.save('chat-1', stored)

    expect(localStorage.getItem('vue-llm:chat:chat-1')).toBeTruthy()

    const loaded = storage.load('chat-1') as UIMessage[]
    expect(loaded).toHaveLength(2)
    expect(loaded[0].createdAt).toBeInstanceOf(Date)
    expect(loaded[0].createdAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z')

    storage.remove('chat-1')
    expect(storage.load('chat-1')).toBeNull()
  })

  it('supports custom prefix and storage', () => {
    const storage = createWebStorage({ prefix: 'app:', storage: sessionStorage })
    storage.save('x', stored)

    expect(sessionStorage.getItem('app:x')).toBeTruthy()
    expect(localStorage.getItem('app:x')).toBeNull()
  })

  it('returns null for corrupted data', () => {
    localStorage.setItem('vue-llm:chat:bad', '{not json')
    expect(createWebStorage().load('bad')).toBeNull()
  })
})

describe('useChat with storage', () => {
  it('restores messages synchronously from storage', () => {
    const storage = createMemoryStorage()
    storage.save('c1', stored)

    const { messages, isRestored } = useChat({ id: 'c1', provider: createMockProvider([]), model: 'm', storage })

    expect(isRestored.value).toBe(true)
    expect(messages.value.map(m => m.id)).toEqual(['u1', 'a1'])
  })

  it('saves after the response finishes, not during streaming', async () => {
    const storage = createMemoryStorage()
    const save = vi.spyOn(storage, 'save')

    const { sendMessage } = useChat({
      id: 'c2',
      provider: createMockProvider([
        { type: 'text-delta', text: 'Hey' },
        { type: 'text-delta', text: ' you' },
        { type: 'finish', finishReason: 'stop' },
      ]),
      model: 'm',
      storage,
    })

    await sendMessage('Hi')
    await nextTick()

    const loaded = storage.load('c2') as UIMessage[]
    expect(loaded).toHaveLength(2)
    expect(loaded[1].parts[0]).toMatchObject({ type: 'text', text: 'Hey you' })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('removes the entry when messages are cleared', async () => {
    const storage = createMemoryStorage()
    storage.save('c3', stored)
    const remove = vi.spyOn(storage, 'remove')

    const { setMessages } = useChat({ id: 'c3', provider: createMockProvider([]), model: 'm', storage })
    setMessages([])
    await nextTick()

    expect(remove).toHaveBeenCalledWith('c3')
    expect(storage.load('c3')).toBeNull()
  })

  it('restores from async storage and flags isRestored', async () => {
    let resolveLoad!: (value: UIMessage[]) => void
    const storage: ChatStorage = {
      load: () => new Promise(r => { resolveLoad = r }),
      save: vi.fn(),
      remove: vi.fn(),
    }

    const { messages, isRestored } = useChat({ id: 'c4', provider: createMockProvider([]), model: 'm', storage })
    expect(isRestored.value).toBe(false)

    resolveLoad(stored)
    await Promise.resolve()

    expect(isRestored.value).toBe(true)
    expect(messages.value).toHaveLength(2)
  })

  it('does not overwrite messages changed before async restore resolves', async () => {
    let resolveLoad!: (value: UIMessage[]) => void
    const storage: ChatStorage = {
      load: () => new Promise(r => { resolveLoad = r }),
      save: vi.fn(),
      remove: vi.fn(),
    }

    const { messages, setMessages } = useChat({ id: 'c5', provider: createMockProvider([]), model: 'm', storage })
    setMessages([{ id: 'new', role: 'user', parts: [{ type: 'text', text: 'fresh' }] }])

    resolveLoad(stored)
    await Promise.resolve()
    await nextTick()

    expect(messages.value.map(m => m.id)).toEqual(['new'])
    expect(storage.save).toHaveBeenCalledWith('c5', messages.value)
  })

  it('reports storage errors through onError', async () => {
    const onError = vi.fn()
    const storage: ChatStorage = {
      load: () => { throw new Error('quota') },
      save: vi.fn(),
      remove: vi.fn(),
    }

    const { isRestored } = useChat({ id: 'c6', provider: createMockProvider([]), model: 'm', storage, onError })

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'quota' }))
    expect(isRestored.value).toBe(true)
  })
})
