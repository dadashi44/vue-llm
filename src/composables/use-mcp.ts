import { getCurrentInstance, getCurrentScope, onMounted, onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import { createMCPAuth, type MCPAuth } from '../mcp/auth.js'
import { openAuthPopup, waitForMCPCallback } from '../mcp/callback.js'
import { createMCPClient, type MCPHttpClient } from '../mcp/client.js'
import { MCPAuthError, MCPUnsupportedServerError } from '../mcp/errors.js'
import { resolveMCPStorage, type MCPStorageOption } from '../mcp/storage.js'
import { mcpTools, type MCPTool } from '../mcp/tools.js'
import {
  authorizeThroughBackend,
  closePopup,
  createMCPBackend,
  mapBackendState,
  toError,
  type MCPBackendEntry,
  type MCPServerModeOptions,
} from './mcp-server-mode.js'

export type MCPState = 'idle' | 'connecting' | 'needs-auth' | 'authorizing' | 'ready' | 'failed'

/** Browser mode: the browser talks to the MCP server and keeps the tokens */
export interface UseMCPBrowserOptions {
  /** The Streamable HTTP endpoint of the MCP server */
  url: string
  server?: undefined
  /** Shown on the provider's consent screen; default `document.title` (or `'vue-llm'`) */
  clientName?: string
  /** OAuth redirect URI; default `${location.origin}/mcp/callback`, relative values resolve against the page */
  callbackUrl?: string
  /** Added before each tool name as `prefix_name` */
  prefix?: string
  /** Only these tools, by their name on the MCP server */
  include?: string[]
  /** Leave out these tools, by their name on the MCP server */
  exclude?: string[]
  /** Connect on mount with stored credentials (never opens a popup). Default `true` */
  autoConnect?: boolean
  /** Where tokens and client registrations are kept. Default `'local'` */
  storage?: MCPStorageOption
}

/**
 * Server mode: the backend (`createMCPConnector`) connects to the server, keeps the tokens and
 * runs the tools; this tracks its state and signs in through it. `tools` stays `[]`.
 */
export interface UseMCPServerModeOptions extends MCPServerModeOptions {
  /** The server's id in the backend's list */
  id: string
  /** Read the state on mount. Default `true` */
  autoConnect?: boolean
}

export type UseMCPOptions = UseMCPBrowserOptions | UseMCPServerModeOptions

export interface UseMCPReturn {
  state: Ref<MCPState>
  /** The server's tools, ready for `useChat({ tools })`; `[]` until `ready` (always `[]` in server mode) */
  tools: Ref<MCPTool[]>
  error: Ref<Error | undefined>
  /** The authorization URL while `authorizing`; render it as a link when the popup was blocked */
  authUrl: Ref<string | undefined>
  serverInfo: Ref<{ name: string; version: string } | undefined>
  /** Connects with stored credentials; ends in `ready` or `needs-auth` */
  connect: () => Promise<void>
  /** Signs in through a popup; call it from a user gesture (click) */
  authorize: () => Promise<void>
  /** Closes the session and keeps the credentials */
  disconnect: () => Promise<void>
  /** Closes the session and forgets the tokens */
  logout: () => Promise<void>
}

interface Session {
  auth: MCPAuth
  client: MCPHttpClient
}

const isClient = () => typeof window !== 'undefined'

/**
 * Connects the browser to one remote MCP server over Streamable HTTP, signs in with OAuth
 * (PKCE, popup) when the server asks for it, and exposes its tools as reactive vue-llm tools.
 *
 * ```ts
 * const notion = useMCP({ url: 'https://mcp.notion.com/mcp', prefix: 'notion' })
 * useChat({ provider, tools: () => notion.tools.value })
 * ```
 *
 * With `server` (and `id`) it drives a server of `createMCPConnector` instead: `connect` enables
 * it, `disconnect` disables it, `authorize` signs in through the backend; the tools run there.
 */
export function useMCP(o: UseMCPOptions): UseMCPReturn {
  return o.server !== undefined ? useServerMCP(o) : useBrowserMCP(o)
}

function useBrowserMCP(o: UseMCPBrowserOptions): UseMCPReturn {
  const state = ref<MCPState>('idle')
  const tools = shallowRef<MCPTool[]>([])
  const error = shallowRef<Error | undefined>()
  const authUrl = ref<string | undefined>()
  const serverInfo = shallowRef<{ name: string; version: string } | undefined>()

  let session: Session | undefined
  /** Bumped by every operation; async work from an older one is dropped */
  let generation = 0
  let authAbort: AbortController | undefined
  /** The popup of the current sign-in, closed when that sign-in is cancelled */
  let authPopup: Window | null = null
  let probed = false
  let unsupported: MCPUnsupportedServerError | undefined

  /** Created lazily: nothing touches window, storage or fetch during setup */
  function ensure(): Session {
    if (session) return session
    const auth = createMCPAuth({
      serverUrl: o.url,
      storage: resolveMCPStorage(o.storage ?? 'local'),
      pendingStorage: resolveMCPStorage('session'),
      clientName: o.clientName ?? (document.title || 'vue-llm'),
      redirectUri: new URL(o.callbackUrl ?? '/mcp/callback', location.href).href,
    })
    session = { auth, client: createMCPClient({ url: o.url, auth }) }
    return session
  }

  /**
   * Cancels the current sign-in and closes its popup, unless `keep` is that same window:
   * `openAuthPopup()` returns the already open named popup to a new `authorize()`.
   */
  function abortAuthWait(keep: Window | null = null) {
    authAbort?.abort(new MCPAuthError('aborted', 'Sign-in was cancelled'))
    authAbort = undefined
    if (authPopup && authPopup !== keep) closePopup(authPopup)
    authPopup = null
  }

  function reset(next: MCPState) {
    tools.value = []
    serverInfo.value = undefined
    authUrl.value = undefined
    state.value = next
  }

  function fail(e: unknown) {
    if (e instanceof MCPUnsupportedServerError) unsupported = e
    reset('failed')
    error.value = e instanceof Error ? e : new Error(String(e))
  }

  /** Checks once per instance that browsers may send `Authorization` to the server */
  async function probe(client: MCPHttpClient) {
    if (unsupported) throw unsupported
    if (probed) return
    await client.probeAuthorizationHeader()
    probed = true
  }

  async function enterNeedsAuth(run: number, client: MCPHttpClient, cause?: Error) {
    await probe(client)
    if (run !== generation) return
    reset('needs-auth')
    error.value = cause
  }

  function wrap(tool: MCPTool, run: number): MCPTool {
    return {
      ...tool,
      async execute(args, context) {
        try {
          return await tool.execute(args, context)
        } catch (e) {
          // the token was revoked or expired for good while ready
          if (e instanceof MCPAuthError && e.code === 'unauthorized' && run === generation && state.value === 'ready') {
            generation++
            reset('needs-auth')
            error.value = e
          }
          throw e
        }
      },
    }
  }

  async function connect(): Promise<void> {
    if (!isClient()) return
    const run = ++generation
    abortAuthWait()
    if (unsupported) return fail(unsupported)
    state.value = 'connecting'
    error.value = undefined
    authUrl.value = undefined
    let client: MCPHttpClient | undefined
    try {
      client = ensure().client
      const result = await client.connect()
      if (run !== generation) return
      if (result.status === 'needs-auth') return await enterNeedsAuth(run, client)
      const listed = await mcpTools(client, { include: o.include, exclude: o.exclude, prefix: o.prefix })
      if (run !== generation) return
      serverInfo.value = result.serverInfo
      tools.value = listed.map(tool => wrap(tool, run))
      state.value = 'ready'
    } catch (e) {
      if (run !== generation) return
      if (client && e instanceof MCPAuthError && e.code === 'unauthorized') {
        try {
          return await enterNeedsAuth(run, client)
        } catch (probeError) {
          if (run === generation) fail(probeError)
          return
        }
      }
      fail(e)
    }
  }

  function authorize(): Promise<void> {
    if (!isClient()) return Promise.resolve()
    if (unsupported) {
      generation++
      abortAuthWait()
      fail(unsupported)
      return Promise.resolve()
    }
    // Synchronously, before any await: keeps the user gesture so the popup isn't blocked
    const popup = openAuthPopup()
    return runAuthorization(popup)
  }

  async function runAuthorization(popup: Window | null): Promise<void> {
    const run = ++generation
    abortAuthWait(popup)
    const controller = new AbortController()
    authAbort = controller
    authPopup = popup
    reset('authorizing')
    error.value = undefined
    try {
      const { auth, client } = ensure()
      await probe(client)
      const { url, state: flowState } = await auth.startAuthorization()
      if (run !== generation) return
      authUrl.value = url
      if (popup) popup.location.href = url
      // A blocked popup gets no closed-window detection: the user may open authUrl by hand
      const message = await waitForMCPCallback(m => m.state === flowState, { popup, signal: controller.signal })
      if (run !== generation) return
      await auth.finishAuthorization({
        state: flowState,
        code: message.code,
        error: message.error,
        errorDescription: message.errorDescription,
      })
      if (run !== generation) return
      authUrl.value = undefined
      await connect()
    } catch (e) {
      // A superseded run never closes the popup: a newer authorize() may have taken it over
      if (run !== generation) return
      closePopup(popup)
      if (authPopup === popup) authPopup = null
      if (e instanceof MCPAuthError) {
        reset('needs-auth')
        error.value = e
      } else {
        fail(e)
      }
    } finally {
      if (authAbort === controller) {
        authAbort = undefined
        authPopup = null
      }
    }
  }

  async function closeSession() {
    await session?.client.close().catch(() => {})
  }

  async function disconnect(): Promise<void> {
    generation++
    abortAuthWait()
    reset('idle')
    error.value = undefined
    await closeSession()
  }

  async function logout(): Promise<void> {
    if (!isClient()) return
    const run = ++generation
    abortAuthWait()
    reset('idle')
    error.value = undefined
    const { auth, client } = ensure()
    try {
      await closeSession()
      await auth.logout()
      if (run !== generation) return
      await enterNeedsAuth(run, client)
    } catch (e) {
      if (run === generation) fail(e)
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      generation++
      abortAuthWait()
      void closeSession()
    })
  }

  if (o.autoConnect !== false && isClient()) {
    if (getCurrentInstance()) onMounted(() => void connect())
    else void connect()
  }

  return { state, tools, error, authUrl, serverInfo, connect, authorize, disconnect, logout }
}

/** Server mode: state and actions of one server of `createMCPConnector` */
function useServerMCP(o: UseMCPServerModeOptions): UseMCPReturn {
  const state = ref<MCPState>('idle')
  const tools = shallowRef<MCPTool[]>([])
  const error = shallowRef<Error | undefined>()
  const authUrl = ref<string | undefined>()
  const serverInfo = shallowRef<{ name: string; version: string } | undefined>()
  const api = createMCPBackend(o)

  /** Bumped by every action; a response from an older one is dropped */
  let generation = 0
  /** Orders list responses: an older one never overwrites a newer one */
  let requests = 0
  let applied = 0
  let authAbort: AbortController | undefined
  let authPopup: Window | null = null
  let disposed = false

  function apply(servers: MCPBackendEntry[], seq: number) {
    if (disposed || seq < applied) return
    applied = seq
    const entry = servers.find(s => s.id === o.id)
    if (!entry) {
      state.value = 'failed'
      error.value = new Error(`useMCP: the backend at ${o.server} has no server "${o.id}"`)
      return
    }
    const mapped = mapBackendState(entry)
    state.value = mapped.state
    error.value = mapped.error
  }

  function fail(e: unknown) {
    state.value = 'failed'
    error.value = toError(e)
  }

  function abortAuthWait(keep: Window | null = null) {
    authAbort?.abort(new MCPAuthError('aborted', 'Sign-in was cancelled'))
    authAbort = undefined
    if (authPopup && authPopup !== keep) closePopup(authPopup)
    authPopup = null
  }

  /** Refetches the state; skipped results while an action or sign-in runs */
  async function refresh(): Promise<void> {
    if (!isClient() || state.value === 'authorizing') return
    const run = generation
    const seq = ++requests
    try {
      const servers = await api.list()
      if (run === generation) apply(servers, seq)
    } catch (e) {
      if (run === generation && !disposed) fail(e)
    }
  }

  async function act(run: () => Promise<MCPBackendEntry[]>, pending: MCPState): Promise<void> {
    if (!isClient()) return
    const g = ++generation
    abortAuthWait()
    authUrl.value = undefined
    error.value = undefined
    state.value = pending
    const seq = ++requests
    try {
      const servers = await run()
      if (g === generation) apply(servers, seq)
    } catch (e) {
      if (g === generation && !disposed) fail(e)
    }
  }

  const connect = () => act(() => api.action(o.id, 'enable'), 'connecting')
  const disconnect = () => act(() => api.action(o.id, 'disable'), 'idle')
  const logout = () => act(() => api.action(o.id, 'logout'), 'idle')

  function authorize(): Promise<void> {
    if (!isClient()) return Promise.resolve()
    // Synchronously, before any await: keeps the user gesture so the popup isn't blocked
    const popup = openAuthPopup()
    return runAuthorization(popup)
  }

  async function runAuthorization(popup: Window | null): Promise<void> {
    const g = ++generation
    abortAuthWait(popup)
    const controller = new AbortController()
    authAbort = controller
    authPopup = popup
    state.value = 'authorizing'
    error.value = undefined
    authUrl.value = undefined
    try {
      await authorizeThroughBackend(api, {
        id: o.id,
        server: o.server,
        popup,
        signal: controller.signal,
        onUrl: (url) => {
          if (g === generation) authUrl.value = url
        },
      })
      if (g !== generation) return
      authUrl.value = undefined
      const seq = ++requests
      apply(await api.list(), seq)
    } catch (e) {
      // A superseded run never closes the popup: a newer authorize() may have taken it over
      if (g !== generation || disposed) return
      closePopup(popup)
      authUrl.value = undefined
      fail(e)
    } finally {
      if (authAbort === controller) {
        authAbort = undefined
        authPopup = null
      }
    }
  }

  const onFocus = () => void refresh()
  if (isClient()) window.addEventListener('focus', onFocus)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      generation++
      abortAuthWait()
      if (isClient()) window.removeEventListener('focus', onFocus)
    })
  }

  if (o.autoConnect !== false && isClient()) {
    if (getCurrentInstance()) onMounted(() => void refresh())
    else void refresh()
  }

  return { state, tools, error, authUrl, serverInfo, connect, authorize, disconnect, logout }
}
