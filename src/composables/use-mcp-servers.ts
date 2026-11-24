import { computed, effectScope, getCurrentScope, markRaw, onScopeDispose, ref, shallowRef, type EffectScope, type Ref, type ShallowRef } from 'vue'
import { MCPUnsupportedServerError } from '../mcp/errors.js'
import type { MCPServerPreset } from '../mcp/servers.js'
import { resolveMCPStorage, type MCPStorageOption } from '../mcp/storage.js'
import { checkUrl, idFromHost } from '../mcp/url.js'
import type { MCPTool } from '../mcp/tools.js'
import { openAuthPopup } from '../mcp/callback.js'
import { MCPAuthError } from '../mcp/errors.js'
import {
  authorizeThroughBackend,
  closePopup,
  createMCPBackend,
  mapBackendState,
  toError,
  type MCPBackendEntry,
  type MCPServerModeOptions,
} from './mcp-server-mode.js'
import { useMCP, type MCPState, type UseMCPReturn } from './use-mcp.js'

/** A catalog entry that isn't a preset: any Streamable HTTP endpoint */
export interface MCPServerEntry {
  /** Stable id; also the prefix of the server's tools (`docs_search`) */
  id: string
  url: string
  /** Shown in the list; default the id */
  name?: string
}

export interface UseMCPServersOptions extends Partial<MCPServerModeOptions> {
  /**
   * Servers the user can turn on and off; all are off until the user enables them.
   * Optional with `server`: the backend's list is the source of truth (shown until it loads)
   */
  catalog?: (MCPServerPreset | MCPServerEntry)[]
  /** Lets the user add servers by URL with `add()`. Default `false`. With `server` the backend's `allowCustom` decides */
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
   * With `server` the backend assigns the id; the returned one is derived the same way.
   */
  add: (server: { url: string; name?: string }) => string
  /** Forgets a server added with `add()` and its tokens; throws for catalog servers */
  remove: (id: string) => Promise<void>
  /** Reconnects every enabled server; with `server`, refetches the list from the backend */
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
const isClient = () => typeof window !== 'undefined'

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
 *
 * With `server: '/api/mcp'` the list, states and actions come from `createMCPConnector` on your
 * backend, which keeps the tokens and runs the tools (`tools` stays `[]`). The list is refetched
 * on `refresh()`, when the window regains focus and after a sign-in popup closes.
 */
export function useMCPServers(o: UseMCPServersOptions = {}): UseMCPServersReturn {
  if (o.server !== undefined) return useServerMCPServers({ ...o, server: o.server })
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

/** Per-server state on top of the backend's list while a request runs or after it failed */
interface Overlay {
  enabled?: boolean
  state?: MCPState
  error?: Error
  authUrl?: string
}

/** A server only this page knows: added and not yet saved, or refused */
interface LocalEntry {
  id: string
  name: string
  url: string
  failure?: Error
}

/** Server mode: the list and actions of `createMCPConnector` */
function useServerMCPServers(o: UseMCPServersOptions & MCPServerModeOptions): UseMCPServersReturn {
  const api = createMCPBackend(o)
  const fallback: MCPBackendEntry[] = (o.catalog ?? []).map(s => ({
    id: s.id,
    name: s.name ?? s.id,
    url: s.url,
    custom: false,
    enabled: false,
    state: 'needs-auth',
  }))
  const remote = shallowRef<MCPBackendEntry[] | undefined>()
  const local = shallowRef<LocalEntry[]>([])
  const overlays = shallowRef(new Map<string, Overlay>())
  /** Requests running per server id: their overlays survive a list refresh */
  const busy = new Map<string, number>()
  let requests = 0
  let applied = 0
  let disposed = false
  let authAbort: AbortController | undefined
  let authPopup: Window | null = null

  function setOverlay(id: string, next: Overlay | undefined) {
    const map = new Map(overlays.value)
    if (next) map.set(id, { ...map.get(id), ...next })
    else map.delete(id)
    overlays.value = map
  }

  function apply(servers: MCPBackendEntry[], seq: number) {
    if (disposed || seq < applied) return
    applied = seq
    remote.value = servers
    const map = new Map<string, Overlay>()
    for (const [id, overlay] of overlays.value) if (busy.get(id)) map.set(id, overlay)
    overlays.value = map
  }

  const toItem = (e: MCPBackendEntry, overlay: Overlay | undefined, failure?: Error): MCPServerItem => {
    const enabled = overlay?.enabled ?? e.enabled
    const mapped = failure
      ? { state: 'failed' as const, error: failure }
      : overlay?.state ? { state: overlay.state, error: overlay.error } : mapBackendState({ ...e, enabled })
    return {
      id: e.id,
      name: e.name,
      url: e.url,
      custom: e.custom,
      enabled,
      state: mapped.state,
      error: mapped.error,
      authUrl: overlay?.authUrl,
      tools: [],
    }
  }

  const list = computed(() => {
    const base = remote.value ?? fallback
    const items = base.map(e => toItem(e, overlays.value.get(e.id)))
    for (const l of local.value) {
      if (base.some(e => e.id === l.id)) continue
      const entry: MCPBackendEntry = { id: l.id, name: l.name, url: l.url, custom: true, enabled: !l.failure, state: 'needs-auth' }
      items.push(toItem(entry, overlays.value.get(l.id), l.failure))
    }
    return items
  })

  function get(id: string): MCPServerItem {
    const item = list.value.find(i => i.id === id)
    if (!item) throw new Error(`useMCPServers: unknown server "${id}"`)
    return item
  }

  const isLocal = (id: string) => local.value.some(l => l.id === id) && !(remote.value ?? []).some(e => e.id === id)

  function uniqueId(base: string): string {
    let id = base
    for (let n = 2; list.value.some(i => i.id === id); n++) id = `${base}-${n}`
    return id
  }

  /** Runs one request for server `id` with `pending` shown until it ends; a failure stays on the entry */
  async function request(id: string, run: () => Promise<MCPBackendEntry[]>, pending: Overlay): Promise<void> {
    if (!isClient()) return
    busy.set(id, (busy.get(id) ?? 0) + 1)
    setOverlay(id, { error: undefined, ...pending })
    const seq = ++requests
    let failure: Error | undefined
    try {
      apply(await run(), seq)
    } catch (e) {
      failure = toError(e)
    } finally {
      const left = (busy.get(id) ?? 1) - 1
      if (left > 0) busy.set(id, left)
      else busy.delete(id)
      if (!disposed && !left) setOverlay(id, failure ? { state: 'failed', error: failure } : undefined)
    }
  }

  async function refresh(): Promise<void> {
    if (!isClient() || disposed) return
    const seq = ++requests
    try {
      apply(await api.list(), seq)
    } catch {
      // The list stays as it was; the next refresh (focus, popup, refresh()) tries again
    }
  }

  function enable(id: string) {
    const item = get(id)
    if (isLocal(id) || item.state === 'authorizing') return
    void request(id, () => api.action(id, 'enable'), { enabled: true, state: 'connecting' })
  }

  function disable(id: string): Promise<void> {
    get(id)
    if (isLocal(id)) return Promise.resolve()
    if (authAbort && overlays.value.get(id)?.state === 'authorizing') abortAuthWait()
    return request(id, () => api.action(id, 'disable'), { enabled: false, state: 'idle' })
  }

  function abortAuthWait(keep: Window | null = null) {
    authAbort?.abort(new MCPAuthError('aborted', 'Sign-in was cancelled'))
    authAbort = undefined
    if (authPopup && authPopup !== keep) closePopup(authPopup)
    authPopup = null
  }

  function authorize(id: string): Promise<void> {
    get(id)
    // Local entries and servers the backend can't use never get a popup
    const unsupported = remote.value?.find(e => e.id === id)?.state === 'unsupported'
    if (isLocal(id) || unsupported || !isClient()) return Promise.resolve()
    // Synchronously, before any await: keeps the user gesture so the popup isn't blocked
    const popup = openAuthPopup()
    return runAuthorization(id, popup)
  }

  async function runAuthorization(id: string, popup: Window | null): Promise<void> {
    abortAuthWait(popup)
    const controller = new AbortController()
    authAbort = controller
    authPopup = popup
    busy.set(id, (busy.get(id) ?? 0) + 1)
    setOverlay(id, { enabled: true, state: 'authorizing', error: undefined, authUrl: undefined })
    let failure: Error | undefined
    try {
      await authorizeThroughBackend(api, {
        id,
        server: o.server,
        popup,
        signal: controller.signal,
        onUrl: url => setOverlay(id, { authUrl: url }),
      })
    } catch (e) {
      // Cancelled by a newer authorize() (which may have taken the popup over), disable() or dispose
      if (!controller.signal.aborted) {
        closePopup(popup)
        failure = toError(e)
      }
    } finally {
      if (authAbort === controller) {
        authAbort = undefined
        authPopup = null
      }
      const left = (busy.get(id) ?? 1) - 1
      if (left > 0) busy.set(id, left)
      else busy.delete(id)
      if (!disposed && !left) setOverlay(id, failure ? { state: 'failed', error: failure } : undefined)
    }
    if (!failure && !controller.signal.aborted) await refresh()
  }

  function add(server: { url: string; name?: string }): string {
    const input = server.url.trim()
    const name = server.name?.trim()
    const url = checkUrl(input)
    if (url instanceof Error) {
      const id = uniqueId('custom')
      local.value = [...local.value, { id, name: name || input || id, url: input, failure: url }]
      return id
    }
    const id = uniqueId(idFromHost(url))
    const entry: LocalEntry = { id, name: name || url.host, url: input }
    local.value = [...local.value, entry]
    void request(id, async () => {
      const result = await api.add({ url: input, ...(name ? { name } : {}) })
      local.value = local.value.filter(l => l !== entry)
      return result.servers
    }, { enabled: true, state: 'connecting' })
    return id
  }

  function remove(id: string): Promise<void> {
    const item = get(id)
    if (!item.custom) throw new Error(`useMCPServers: "${id}" is in the catalog; disable it instead`)
    if (isLocal(id)) {
      local.value = local.value.filter(l => l.id !== id)
      setOverlay(id, undefined)
      return Promise.resolve()
    }
    return request(id, () => api.remove(id), {})
  }

  const onFocus = () => void refresh()
  if (isClient()) {
    window.addEventListener('focus', onFocus)
    void refresh()
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      abortAuthWait()
      if (isClient()) window.removeEventListener('focus', onFocus)
    })
  }

  const tools = computed<MCPTool[]>(() => [])

  return { list, tools, enable, disable, authorize, add, remove, refresh }
}
