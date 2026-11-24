import { computed, effectScope, getCurrentScope, markRaw, onScopeDispose, ref, shallowRef, type EffectScope, type Ref, type ShallowRef } from 'vue'
import { MCPUnsupportedServerError } from '../mcp/errors.js'
import type { MCPServerPreset } from '../mcp/servers.js'
import { resolveMCPStorage, type MCPStorageOption } from '../mcp/storage.js'
import type { MCPTool } from '../mcp/tools.js'
import { useMCP, type MCPState, type UseMCPReturn } from './use-mcp.js'

/** A catalog entry that isn't a preset: any Streamable HTTP endpoint */
export interface MCPServerEntry {
  /** Stable id; also the prefix of the server's tools (`docs_search`) */
  id: string
  url: string
  /** Shown in the list; default the id */
  name?: string
}

export interface UseMCPServersOptions {
  /** Servers the user can turn on and off; all are off until the user enables them */
  catalog?: (MCPServerPreset | MCPServerEntry)[]
  /** Lets the user add servers by URL with `add()`. Default `false` */
  allowCustom?: boolean
  /** OAuth redirect URI for every server; default `${location.origin}/mcp/callback` */
  callbackUrl?: string
  /** Shown on the providers' consent screens; default `document.title` */
  clientName?: string
  /** Where tokens and the list (enabled servers, added servers) are kept. Default `'local'` */
  storage?: MCPStorageOption
}

export interface MCPServerItem {
  readonly id: string
  readonly name: string
  readonly url: string
  /** Added by the user with `add()` */
  readonly custom: boolean
  readonly enabled: boolean
  readonly state: MCPState
  readonly error: Error | undefined
  /** The authorization URL while `authorizing`; render it as a link when the popup was blocked */
  readonly authUrl: string | undefined
  /** This server's tools, prefixed with its id; `[]` until `ready` */
  readonly tools: MCPTool[]
}

export interface UseMCPServersReturn {
  list: Readonly<Ref<MCPServerItem[]>>
  /** The tools of every enabled server in `ready`, ready for `useChat({ tools })` */
  tools: Readonly<Ref<MCPTool[]>>
  /** Turns a server on and connects it with stored credentials (never opens a popup) */
  enable: (id: string) => void
  /** Turns a server off: closes its session and keeps its credentials */
  disable: (id: string) => Promise<void>
  /** Signs in to a server through a popup (enabling it); call it from a user gesture (click) */
  authorize: (id: string) => Promise<void>
  /**
   * Adds a server by URL (needs `allowCustom`) and returns its id, derived from the host.
   * An invalid URL doesn't throw: the entry is added in `failed` with the reason in `error`.
   */
  add: (server: { url: string; name?: string }) => string
  /** Forgets a server added with `add()` and its tokens; throws for catalog servers */
  remove: (id: string) => Promise<void>
  /** Reconnects every enabled server */
  refresh: () => Promise<void>
}

interface Entry {
  id: string
  name: string
  url: string
  custom: boolean
  enabled: Ref<boolean>
  /** The connection; created on first enable or authorize */
  session: ShallowRef<UseMCPReturn | undefined>
  scope?: EffectScope
  /** Set when the entry can never connect here (server-only preset, invalid URL) */
  failure?: Error
  item: MCPServerItem
}

interface Persisted {
  enabled: string[]
  custom: { id: string; url: string; name: string }[]
}

const STORAGE_KEY = 'servers'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const isClient = () => typeof window !== 'undefined'

/** https only; http only for local development */
function checkUrl(input: string): URL | Error {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return new Error(`"${input}" is not a valid URL`)
  }
  if (url.protocol === 'https:') return url
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url
  return new Error(`MCP servers must use https:// (http:// only on localhost): ${input}`)
}

/** `mcp.example.com` → `example`, `api.foo.io` → `api` */
function idFromHost(url: URL): string {
  let host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const stripped = host.replace(/^(mcp|www)\./, '')
  if (stripped.includes('.')) host = stripped
  return host.split('.')[0].replace(/[^a-z0-9-]/g, '') || 'server'
}

function parsePersisted(raw: string | null | undefined): Persisted | undefined {
  if (!raw) return undefined
  try {
    const data = JSON.parse(raw) as Partial<Persisted> | null
    if (!data || typeof data !== 'object') return undefined
    const enabled = Array.isArray(data.enabled) ? data.enabled.filter((id): id is string => typeof id === 'string') : []
    const custom = Array.isArray(data.custom)
      ? data.custom.filter(c => c && typeof c.id === 'string' && typeof c.url === 'string').map(c => ({ id: c.id, url: c.url, name: typeof c.name === 'string' ? c.name : c.url }))
      : []
    return { enabled, custom }
  } catch {
    return undefined
  }
}

/**
 * Manages several remote MCP servers: a catalog the developer defines (the user turns entries
 * on and off) and, with `allowCustom`, servers the user adds by URL. One `useMCP` per server;
 * each server's tools are prefixed with its id so they never collide.
 *
 * ```ts
 * const connectors = useMCPServers({ catalog: [mcpServers.notion, mcpServers.linear], allowCustom: true })
 * useChat({ provider, tools: () => connectors.tools.value })
 * ```
 */
export function useMCPServers(o: UseMCPServersOptions = {}): UseMCPServersReturn {
  const storage = resolveMCPStorage(o.storage ?? 'local')
  const entries = shallowRef<Entry[]>([])
  let disposed = false
  /** Writes wait until the saved list was read, so an async storage isn't overwritten */
  let restored = false
  let dirty = false

  function makeEntry(init: { id: string; name: string; url: string; custom: boolean; failure?: Error }): Entry {
    const entry: Entry = {
      ...init,
      enabled: ref(false),
      session: shallowRef(),
      item: undefined as unknown as MCPServerItem,
    }
    const session = () => (entry.failure ? undefined : entry.session.value)
    entry.item = markRaw({
      id: entry.id,
      name: entry.name,
      url: entry.url,
      custom: entry.custom,
      get enabled() {
        return entry.enabled.value
      },
      get state(): MCPState {
        return entry.failure ? 'failed' : (session()?.state.value ?? 'idle')
      },
      get error() {
        return entry.failure ?? session()?.error.value
      },
      get authUrl() {
        return session()?.authUrl.value
      },
      get tools() {
        return session()?.tools.value ?? []
      },
    })
    return entry
  }

  const find = (id: string) => entries.value.find(e => e.id === id)
  function get(id: string): Entry {
    const entry = find(id)
    if (!entry) throw new Error(`useMCPServers: unknown server "${id}"`)
    return entry
  }

  function uniqueId(base: string): string {
    let id = base
    for (let n = 2; find(id); n++) id = `${base}-${n}`
    return id
  }

  for (const server of o.catalog ?? []) {
    if (find(server.id)) throw new Error(`useMCPServers: duplicate catalog id "${server.id}"`)
    const name = server.name ?? server.id
    const serverOnly = 'modes' in server && !server.modes.includes('browser')
    const failure = serverOnly
      ? new MCPUnsupportedServerError('cors', `${name} works only in server mode: connect it through createMCPConnector`)
      : undefined
    entries.value = [...entries.value, makeEntry({ id: server.id, name, url: server.url, custom: false, failure })]
  }

  /** Browser backend: one `useMCP` per server in its own scope, so it can be stopped alone */
  function open(entry: Entry, autoConnect: boolean): UseMCPReturn {
    const scope = effectScope(true)
    const session = scope.run(() =>
      useMCP({
        url: entry.url,
        prefix: entry.id,
        clientName: o.clientName,
        callbackUrl: o.callbackUrl,
        storage,
        autoConnect,
      }),
    )!
    entry.scope = scope
    entry.session.value = session
    return session
  }

  function start(entry: Entry) {
    if (entry.failure) return
    const session = entry.session.value
    if (session) void session.connect()
    else open(entry, true)
  }

  function persist() {
    if (!isClient() || disposed) return
    if (!restored) {
      dirty = true
      return
    }
    const data: Persisted = {
      enabled: entries.value.filter(e => e.enabled.value).map(e => e.id),
      custom: entries.value.filter(e => e.custom && !e.failure).map(e => ({ id: e.id, url: e.url, name: e.name })),
    }
    try {
      void Promise.resolve(storage.set(STORAGE_KEY, JSON.stringify(data))).catch(() => {})
    } catch {
      // storage unavailable: the list lives for this page only
    }
  }

  function restore(raw: string | null | undefined) {
    if (disposed) return
    const saved = parsePersisted(raw)
    if (saved && o.allowCustom) {
      for (const c of saved.custom) {
        const url = checkUrl(c.url)
        if (url instanceof Error) continue
        const id = /^[a-z0-9-]+$/.test(c.id) && !find(c.id) ? c.id : uniqueId(idFromHost(url))
        entries.value = [...entries.value, makeEntry({ id, name: c.name, url: c.url, custom: true })]
      }
    }
    for (const id of saved?.enabled ?? []) {
      const entry = find(id)
      if (!entry || entry.enabled.value) continue
      entry.enabled.value = true
      start(entry)
    }
    restored = true
    if (dirty) persist()
  }

  if (isClient()) {
    let raw: ReturnType<typeof storage.get> | undefined
    try {
      raw = storage.get(STORAGE_KEY)
    } catch {
      raw = undefined
    }
    if (raw && typeof (raw as Promise<unknown>).then === 'function') {
      ;(raw as Promise<string | null | undefined>).then(restore, () => restore(undefined))
    } else {
      restore(raw as string | null | undefined)
    }
  }

  function enable(id: string) {
    const entry = get(id)
    if (entry.enabled.value && (entry.session.value || entry.failure)) return
    entry.enabled.value = true
    start(entry)
    persist()
  }

  function disable(id: string): Promise<void> {
    const entry = get(id)
    if (entry.enabled.value) {
      entry.enabled.value = false
      persist()
    }
    return entry.session.value?.disconnect() ?? Promise.resolve()
  }

  function authorize(id: string): Promise<void> {
    const entry = get(id)
    if (entry.failure) return Promise.resolve()
    // No await before the session's authorize(): it must open the popup within the user gesture
    const result = (entry.session.value ?? open(entry, false)).authorize()
    if (!entry.enabled.value) {
      entry.enabled.value = true
      persist()
    }
    return result
  }

  function add(server: { url: string; name?: string }): string {
    if (!o.allowCustom) throw new Error('useMCPServers: adding servers needs allowCustom: true')
    const input = server.url.trim()
    const name = server.name?.trim()
    const url = checkUrl(input)
    if (url instanceof Error) {
      const id = uniqueId('custom')
      entries.value = [...entries.value, makeEntry({ id, name: name || input || id, url: input, custom: true, failure: url })]
      return id
    }
    const id = uniqueId(idFromHost(url))
    const entry = makeEntry({ id, name: name || url.host, url: input, custom: true })
    entries.value = [...entries.value, entry]
    entry.enabled.value = true
    start(entry)
    persist()
    return id
  }

  function remove(id: string): Promise<void> {
    const entry = get(id)
    if (!entry.custom) throw new Error(`useMCPServers: "${id}" is in the catalog; disable it instead`)
    entries.value = entries.value.filter(e => e !== entry)
    entry.enabled.value = false
    persist()
    if (entry.failure) return Promise.resolve()
    const session = entry.session.value ?? open(entry, false)
    return session.logout().finally(() => entry.scope?.stop())
  }

  async function refresh(): Promise<void> {
    await Promise.all(
      entries.value
        .filter(e => e.enabled.value && e.session.value && e.session.value.state.value !== 'authorizing')
        .map(e => e.session.value!.connect()),
    )
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      for (const entry of entries.value) entry.scope?.stop()
    })
  }

  const list = computed(() => entries.value.map(e => e.item))
  const tools = computed(() =>
    entries.value.flatMap(e => (e.enabled.value && e.item.state === 'ready' ? e.item.tools : [])),
  )

  return { list, tools, enable, disable, authorize, add, remove, refresh }
}
