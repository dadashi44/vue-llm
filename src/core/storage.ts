import type { UIMessage } from '../types'

type MaybePromise<T> = T | Promise<T>

export interface ChatStorage {
  load(id: string): MaybePromise<UIMessage[] | null | undefined>
  save(id: string, messages: UIMessage[]): MaybePromise<void>
  remove(id: string): MaybePromise<void>
}

export interface WebStorageOptions {
  prefix?: string
  storage?: Storage
}

export function createWebStorage(options: WebStorageOptions = {}): ChatStorage {
  const prefix = options.prefix ?? 'vue-llm:chat:'
  const getStorage = (): Storage | undefined => {
    if (options.storage) return options.storage
    return typeof localStorage !== 'undefined' ? localStorage : undefined
  }

  return {
    load(id) {
      const raw = getStorage()?.getItem(prefix + id)
      if (!raw) return null
      try {
        return deserializeMessages(raw)
      } catch {
        return null
      }
    },
    save(id, messages) {
      getStorage()?.setItem(prefix + id, JSON.stringify(messages))
    },
    remove(id) {
      getStorage()?.removeItem(prefix + id)
    },
  }
}

export function createMemoryStorage(): ChatStorage {
  const store = new Map<string, string>()

  return {
    load(id) {
      const raw = store.get(id)
      return raw ? deserializeMessages(raw) : null
    },
    save(id, messages) {
      store.set(id, JSON.stringify(messages))
    },
    remove(id) {
      store.delete(id)
    },
  }
}

export function deserializeMessages(raw: string): UIMessage[] {
  const parsed = JSON.parse(raw) as UIMessage[]
  if (!Array.isArray(parsed)) return []
  return parsed.map(msg => ({
    ...msg,
    createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
  }))
}
