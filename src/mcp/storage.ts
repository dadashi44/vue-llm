type MaybePromise<T> = T | Promise<T>

export interface MCPAuthStorage {
  get(key: string): MaybePromise<string | null | undefined>
  set(key: string, value: string, options?: { ttl?: number }): MaybePromise<void>
  remove(key: string): MaybePromise<void>
}

export type MCPStorageOption = 'local' | 'session' | 'memory' | MCPAuthStorage

const PREFIX = 'vue-llm:mcp:'

function memoryStorage(): MCPAuthStorage {
  const map = new Map<string, string>()
  return {
    get: (key) => map.get(key) ?? null,
    set(key, value) {
      map.set(key, value)
    },
    remove(key) {
      map.delete(key)
    },
  }
}

function webStorage(kind: 'local' | 'session'): MCPAuthStorage {
  const fallback = memoryStorage()
  const area = (): Storage | undefined => {
    try {
      return kind === 'local' ? localStorage : sessionStorage
    } catch {
      return undefined
    }
  }
  return {
    get(key) {
      try {
        const a = area()
        const value = a?.getItem(PREFIX + key)
        if (value != null) return value
      } catch {
        /* fall through to memory */
      }
      return fallback.get(key)
    },
    set(key, value) {
      try {
        const a = area()
        if (a) {
          a.setItem(PREFIX + key, value)
          fallback.remove(key)
          return
        }
      } catch {
        /* quota, privacy mode: keep in memory */
      }
      return fallback.set(key, value)
    },
    remove(key) {
      try {
        area()?.removeItem(PREFIX + key)
      } catch {
        /* ignore */
      }
      return fallback.remove(key)
    },
  }
}

export function resolveMCPStorage(option: MCPStorageOption = 'local'): MCPAuthStorage {
  if (typeof option === 'object') return option
  if (option === 'memory') return memoryStorage()
  return webStorage(option)
}
