import { waitForMCPCallback } from '../mcp/callback.js'
import { MCPAuthError } from '../mcp/errors.js'
import { toValue, type MaybeRefOrGetter } from '../utils/vue.js'
import type { MCPState } from './use-mcp.js'

/** Options shared by `useMCP` and `useMCPServers` when they talk to `createMCPConnector` */
export interface MCPServerModeOptions {
  /** Where `createMCPConnector`'s handler is mounted, e.g. `'/api/mcp'` (its `basePath`) */
  server: string
  /** Used for every request to `server`; default `globalThis.fetch` */
  fetch?: typeof fetch
  /** Sent with every request to `server`, e.g. `{ Authorization: 'Bearer …' }` for bearer-token apps */
  headers?: MaybeRefOrGetter<Record<string, string> | undefined>
  /** Default `'include'`, so session cookies reach a backend on another origin */
  credentials?: RequestCredentials
}

/** One server in `GET {server}/servers` (`MCPConnectorEntry`) */
export interface MCPBackendEntry {
  id: string
  name: string
  url: string
  custom: boolean
  enabled: boolean
  state: 'connected' | 'needs-auth' | 'unsupported' | 'error'
  error?: string
}

export interface MCPBackendAPI {
  list(): Promise<MCPBackendEntry[]>
  add(body: { url: string; name?: string }): Promise<{ id: string; servers: MCPBackendEntry[] }>
  remove(id: string): Promise<MCPBackendEntry[]>
  action(id: string, verb: 'enable' | 'disable' | 'logout'): Promise<MCPBackendEntry[]>
  /** The provider's sign-in URL, or `null` when the server is already connected */
  authorize(id: string): Promise<string | null>
}

function servers(data: unknown): MCPBackendEntry[] {
  const list = (data as { servers?: unknown } | null)?.servers
  if (!Array.isArray(list)) throw new Error('MCP backend: unexpected response')
  return list.filter((s): s is MCPBackendEntry => !!s && typeof s === 'object' && typeof s.id === 'string')
}

/** The routes of `createMCPConnector`; nothing is fetched until a method is called */
export function createMCPBackend(o: MCPServerModeOptions): MCPBackendAPI {
  const base = o.server.replace(/\/+$/, '')
  const path = (id: string) => `/servers/${encodeURIComponent(id)}`

  async function request(method: string, route: string, body?: unknown): Promise<unknown> {
    const fetchFn = o.fetch ?? globalThis.fetch
    const response = await fetchFn(`${base}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...toValue(o.headers) },
      credentials: o.credentials ?? 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    let data: unknown
    try {
      data = await response.json()
    } catch {
      data = undefined
    }
    if (!response.ok) {
      const message = (data as { error?: unknown } | undefined)?.error
      throw new Error(typeof message === 'string' && message ? message : `MCP backend: HTTP ${response.status}`)
    }
    return data
  }

  return {
    list: async () => servers(await request('GET', '/servers')),
    async add(body) {
      const data = await request('POST', '/servers', body)
      return { id: String((data as { id?: unknown }).id), servers: servers(data) }
    },
    remove: async id => servers(await request('DELETE', path(id))),
    action: async (id, verb) => servers(await request('POST', `${path(id)}/${verb}`)),
    async authorize(id) {
      const url = (await request('POST', `${path(id)}/authorize`) as { url?: unknown } | undefined)?.url
      return typeof url === 'string' ? url : null
    },
  }
}

/**
 * A backend entry as a `useMCP` state: `connected` → `ready`, `needs-auth` → `needs-auth`,
 * `unsupported`/`error` → `failed` with the entry's error; a disabled server is `idle`
 * (its tools don't run), except an unsupported one, which can never connect.
 */
export function mapBackendState(e: MCPBackendEntry): { state: MCPState; error: Error | undefined } {
  if (e.state === 'unsupported') return { state: 'failed', error: new Error(e.error || `${e.name} is not supported`) }
  if (!e.enabled) return { state: 'idle', error: undefined }
  if (e.state === 'connected') return { state: 'ready', error: undefined }
  if (e.state === 'needs-auth') return { state: 'needs-auth', error: e.error ? new Error(e.error) : undefined }
  return { state: 'failed', error: new Error(e.error || 'Could not connect to the MCP server') }
}

export function closePopup(popup: Window | null) {
  try {
    if (popup && !popup.closed) popup.close()
  } catch {
    // cross-origin access to the popup can throw in some browsers
  }
}

/**
 * Signs in to server `id` through the backend in `popup`, which the caller opened with
 * `about:blank` within the user gesture: POSTs `/authorize`, navigates the popup to the
 * provider and waits for the callback page's message or for the popup to close. Resolves when
 * the flow is over (the caller then refetches the state); rejects when a request fails or `signal` aborts.
 */
export async function authorizeThroughBackend(
  api: MCPBackendAPI,
  o: { id: string; server: string; popup: Window | null; signal: AbortSignal; onUrl: (url: string) => void },
): Promise<void> {
  const url = await api.authorize(o.id)
  if (o.signal.aborted) throw o.signal.reason
  if (url === null) {
    // Already connected: no sign-in needed
    closePopup(o.popup)
    return
  }
  o.onUrl(url)
  if (o.popup) o.popup.location.href = url
  let origin: string | undefined
  try {
    origin = new URL(o.server, location.href).origin
  } catch {
    origin = undefined
  }
  try {
    // A blocked popup gets no closed-window detection: the user may open the URL by hand
    await waitForMCPCallback(m => m.id === o.id, { popup: o.popup, signal: o.signal, origin })
  } catch (e) {
    // The callback page closes itself; when its message is lost the state is refetched all the same
    if (e instanceof MCPAuthError && e.code === 'popup_closed') return
    throw e
  }
}

export const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))
