import { createMCPAuth, type MCPAuth } from './auth.js'
import { createMCPClient, type MCPHttpClient } from './client.js'
import { decryptValue, encryptValue } from './crypto.js'
import { MCPAuthError, MCPHTTPError, MCPProtocolError, MCPUnsupportedServerError } from './errors.js'
import type { MCPServerPreset } from './servers.js'
import type { MCPAuthStorage } from './storage.js'
import { mcpTools, type MCPTool } from './tools.js'
import { checkUrl, idFromHost } from './url.js'

/** A server in `createMCPConnector({ servers })` that isn't a preset */
export interface MCPConnectorServer {
  /** Stable id; also the prefix of the server's tools (`docs_search`) */
  id: string
  url: string
  /** Shown in the list; default the id */
  name?: string
  /** A pre-registered OAuth client, for servers without dynamic client registration */
  oauth?: MCPServerPreset['oauth']
}

export interface MCPConnectorOptions {
  /** Where `handler` is mounted, e.g. `'/api/mcp'` */
  basePath: string
  /** Absolute origin of the app (`https://app.example.com`); the OAuth callback is `${publicUrl}${basePath}/callback` */
  publicUrl: string
  /** Frontend origins; default the origin of `publicUrl`. The first one receives the callback message */
  allowedOrigins?: string[]
  /** The catalog every user can turn on */
  servers: (MCPServerPreset | MCPConnectorServer)[]
  /** Lets users add servers by URL. Default `false` */
  allowCustom?: boolean
  /** Host patterns custom servers must match: `example.com` or `*.example.com` */
  allowHosts?: string[]
  /** Whose connections these are: a stable user id, or `null` when signed out (401) */
  user: (request: Request) => string | null | Promise<string | null>
  /** Where tokens, client registrations and each user's list live (any async key-value store) */
  store: MCPAuthStorage
  /** Encrypts every stored value (AES-GCM); without it values are stored in plain text */
  secret?: string
  /** Shown on the providers' consent screens; default the host of `publicUrl` */
  clientName?: string
  /** Used for every outbound request (discovery, registration, tokens, MCP); default `globalThis.fetch` */
  fetch?: typeof fetch
}

export type MCPConnectorState = 'connected' | 'needs-auth' | 'unsupported' | 'error'

/** One server in `GET /servers` */
export interface MCPConnectorEntry {
  id: string
  name: string
  url: string
  /** Added by the user with `POST /servers` */
  custom: boolean
  enabled: boolean
  state: MCPConnectorState
  error?: string
}

export interface MCPConnector {
  /** Web-standard handler for the routes under `basePath` */
  handler(request: Request): Promise<Response>
  /** The tools of the user's enabled, connected servers, prefixed with each server's id */
  toolsFor(request: Request): Promise<MCPTool[]>
}

interface Resolved {
  id: string
  name: string
  url: string
  custom: boolean
  oauth?: MCPServerPreset['oauth']
  /** Why this server can't be used through the backend */
  unsupported?: string
}

interface UserData {
  enabled: string[]
  custom: { id: string; url: string; name: string }[]
  states: Record<string, { state: MCPConnectorState; error?: string }>
}

interface StateIndex {
  userId: string
  serverId: string
  expiresAt: number
}

interface Connection {
  client: MCPHttpClient
  tools: MCPTool[]
}

interface CacheEntry {
  url: string
  expiresAt: number
  result: Promise<Connection | undefined>
}

/** OAuth `state` lifetime, as the pending entry written by `createMCPAuth` */
const STATE_TTL_SECONDS = 600
/**
 * How long `toolsFor` reuses a user's connection to a server without contacting it: 60 s.
 * After that the tools are listed again on the same session (reconnecting if that fails).
 * Tokens are read from the store on every MCP request, so a logout or token refresh takes
 * effect right away. Expired connections are not closed, because a chat request may still
 * be running their tools; stateful servers expire idle sessions themselves.
 */
const CONNECTION_TTL_MS = 60_000
const CHANNEL = 'vue-llm:mcp'
const MESSAGE_TYPE = 'vue-llm:mcp-callback'
const ACTIONS = new Set(['enable', 'disable', 'authorize', 'logout'])

/** A server-side network failure (DNS, refused, TLS): not the browser's CORS case */
class MCPNetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MCPNetworkError'
  }
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function parse<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function hostOf(input: RequestInfo | URL): string {
  try {
    return new URL(input instanceof Request ? input.url : String(input)).host
  } catch {
    return String(input)
  }
}

/** Values come back as strings (stores like unstorage parse JSON), decrypted when `secret` is set */
function wrapStore(store: MCPAuthStorage, secret: string | undefined): MCPAuthStorage {
  return {
    async get(key) {
      const raw: unknown = await store.get(key)
      if (raw == null) return null
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
      if (!secret) return text
      try {
        return await decryptValue(secret, text)
      } catch {
        // Not ours, or written with another secret: treat as missing
        return null
      }
    },
    async set(key, value, options) {
      await store.set(key, secret ? await encryptValue(secret, value) : value, options)
    },
    async remove(key) {
      await store.remove(key)
    },
  }
}

function matchesHost(host: string, patterns: string[]): boolean {
  const h = host.toLowerCase()
  return patterns.some((p) => {
    const pattern = p.toLowerCase()
    return pattern.startsWith('*.') ? h.endsWith(pattern.slice(1)) : h === pattern
  })
}

/** JSON for a `<script>`: nothing can close the element or break the JS string */
function scriptJSON(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

/** Shown in the user's list; never contains tokens (errors carry provider error codes and server messages) */
function failure(error: unknown): { state: MCPConnectorState; error: string } {
  if (error instanceof MCPUnsupportedServerError) return { state: 'unsupported', error: error.message }
  if (error instanceof MCPAuthError) return { state: 'needs-auth', error: error.message }
  if (error instanceof MCPNetworkError || error instanceof MCPHTTPError || error instanceof MCPProtocolError) {
    return { state: 'error', error: error.message }
  }
  return { state: 'error', error: 'Unexpected error while connecting to the server' }
}

/**
 * Lets each signed-in user of your app connect their own MCP servers through your backend.
 * OAuth runs on the server; tokens are kept (encrypted with `secret`) in `store` and never
 * reach the browser. Mount `handler` under `basePath` and pass `toolsFor` to `createLLMHandler`.
 *
 * ```ts
 * const mcp = createMCPConnector({
 *   basePath: '/api/mcp',
 *   publicUrl: 'https://app.example.com',
 *   servers: [mcpServers.notion, mcpServers.linear],
 *   user: request => getUserId(request),
 *   store: useStorage('mcp'),
 *   secret: process.env.MCP_SECRET,
 * })
 * createLLMHandler({ provider, tools: request => mcp.toolsFor(request) })
 * ```
 */
export function createMCPConnector(o: MCPConnectorOptions): MCPConnector {
  const basePath = o.basePath.replace(/\/+$/, '')
  if (!basePath.startsWith('/')) throw new Error('createMCPConnector: basePath must start with "/"')
  let publicOrigin: string
  try {
    publicOrigin = new URL(o.publicUrl).origin
  } catch {
    throw new Error('createMCPConnector: publicUrl must be an absolute URL such as https://app.example.com')
  }
  const publicUrl = o.publicUrl.replace(/\/+$/, '')
  const redirectUri = `${publicUrl}${basePath}/callback`
  const frontendOrigin = o.allowedOrigins?.[0] ?? publicOrigin
  const clientName = o.clientName ?? new URL(publicUrl).host
  const storage = wrapStore(o.store, o.secret)

  const catalog: Resolved[] = []
  for (const s of o.servers) {
    if (catalog.some(c => c.id === s.id)) throw new Error(`createMCPConnector: duplicate server id "${s.id}"`)
    const name = s.name ?? s.id
    const modes = 'modes' in s ? s.modes : undefined
    catalog.push({
      id: s.id,
      name,
      url: s.url,
      custom: false,
      ...(s.oauth ? { oauth: s.oauth } : {}),
      ...(modes && !modes.includes('server') ? { unsupported: `${name} works only in browser mode` } : {}),
    })
  }

  const baseFetch: typeof fetch = o.fetch ?? ((...args) => globalThis.fetch(...args))
  /** Every outbound request (discovery, registration, tokens, MCP) goes through here */
  const fetchFn: typeof fetch = async (input, init) => {
    try {
      return await baseFetch(input, init)
    } catch (error) {
      if (error instanceof TypeError) throw new MCPNetworkError(`Could not reach ${hostOf(input)}`)
      throw error
    }
  }

  // --- per-user data ---------------------------------------------------------------

  const userPrefix = (userId: string) => `u:${encodeURIComponent(userId)}:`
  const userKey = (userId: string) => `${userPrefix(userId)}servers`
  const stateKey = (state: string) => `state:${state}`

  async function load(userId: string): Promise<UserData> {
    const d = parse<Partial<UserData>>(await storage.get(userKey(userId)))
    return {
      enabled: Array.isArray(d?.enabled) ? d.enabled.filter((id): id is string => typeof id === 'string') : [],
      custom: Array.isArray(d?.custom) ? d.custom.filter(c => c && typeof c.id === 'string' && typeof c.url === 'string') : [],
      states: d?.states && typeof d.states === 'object' ? d.states : {},
    }
  }

  /** Read-modify-write of a user's data, one at a time per user within this instance */
  const locks = new Map<string, Promise<unknown>>()
  function update<T>(userId: string, mutate: (d: UserData) => T | false): Promise<T | false> {
    const run = async () => {
      const d = await load(userId)
      const result = mutate(d)
      if (result !== false) await storage.set(userKey(userId), JSON.stringify(d))
      return result
    }
    const previous = locks.get(userId) ?? Promise.resolve()
    const next = previous.then(run, run)
    const tail = next.catch(() => {})
    locks.set(userId, tail)
    void tail.then(() => {
      if (locks.get(userId) === tail) locks.delete(userId)
    })
    return next
  }

  function resolveAll(d: UserData): Resolved[] {
    return [...catalog, ...d.custom.map(c => ({ id: c.id, name: c.name, url: c.url, custom: true }))]
  }

  function entries(d: UserData): MCPConnectorEntry[] {
    return resolveAll(d).map((s) => {
      const base = { id: s.id, name: s.name, url: s.url, custom: s.custom, enabled: d.enabled.includes(s.id) }
      if (s.unsupported) return { ...base, state: 'unsupported', error: s.unsupported }
      const st = d.states[s.id] ?? { state: 'needs-auth' }
      return { ...base, state: st.state, ...(st.error ? { error: st.error } : {}) }
    })
  }

  /** Persists a server's state; writes only when it changed and the server still exists */
  function record(userId: string, id: string, next: { state: MCPConnectorState; error?: string }) {
    return update(userId, (d) => {
      if (!resolveAll(d).some(s => s.id === id)) return false
      const current = d.states[id]
      if (current?.state === next.state && current.error === next.error) return false
      d.states[id] = next.error ? next : { state: next.state }
      return true
    })
  }

  // --- MCP connections ---------------------------------------------------------------

  function authFor(userId: string, s: Resolved): MCPAuth {
    return createMCPAuth({
      serverUrl: s.url,
      storage,
      pendingStorage: storage,
      keyPrefix: userPrefix(userId),
      clientName,
      redirectUri,
      fetch: fetchFn,
      ...(s.oauth ? { client: { client_id: s.oauth.clientId, client_secret: s.oauth.clientSecret } } : {}),
    })
  }

  function clientFor(userId: string, s: Resolved): { auth: MCPAuth; client: MCPHttpClient } {
    const auth = authFor(userId, s)
    return { auth, client: createMCPClient({ url: s.url, auth, fetch: fetchFn }) }
  }

  const cache = new Map<string, CacheEntry>()
  const cacheKey = (userId: string, id: string) => `${userId}\n${id}`

  function invalidate(userId: string, id: string) {
    const key = cacheKey(userId, id)
    const hit = cache.get(key)
    cache.delete(key)
    void hit?.result.then(c => c?.client.close()).catch(() => {})
  }

  async function open(userId: string, s: Resolved, previous?: Promise<Connection | undefined>): Promise<Connection | undefined> {
    const prev = await previous?.catch(() => undefined)
    if (prev) {
      try {
        const tools = await mcpTools(prev.client, { prefix: s.id })
        await record(userId, s.id, { state: 'connected' })
        return { client: prev.client, tools }
      } catch {
        // The session or token went stale: reconnect below
      }
    }
    const { client } = clientFor(userId, s)
    try {
      const result = await client.connect()
      if (result.status === 'needs-auth') {
        await record(userId, s.id, { state: 'needs-auth' })
        return undefined
      }
      const tools = await mcpTools(client, { prefix: s.id })
      await record(userId, s.id, { state: 'connected' })
      return { client, tools }
    } catch (error) {
      await record(userId, s.id, failure(error))
      return undefined
    }
  }

  /** The server's tools for this user, reusing a cached connection; `[]` when it can't connect */
  async function connectServer(userId: string, s: Resolved): Promise<MCPTool[]> {
    const key = cacheKey(userId, s.id)
    const hit = cache.get(key)
    if (hit && hit.url === s.url && Date.now() < hit.expiresAt) return (await hit.result)?.tools ?? []
    const entry: CacheEntry = {
      url: s.url,
      expiresAt: Infinity, // shared by concurrent callers while connecting
      result: open(userId, s, hit?.url === s.url ? hit.result : undefined),
    }
    cache.set(key, entry)
    const connection = await entry.result.catch(() => undefined)
    if (cache.get(key) === entry) {
      if (connection) entry.expiresAt = Date.now() + CONNECTION_TTL_MS
      else cache.delete(key)
    }
    return connection?.tools ?? []
  }

  // --- routes ------------------------------------------------------------------------

  async function resolveUser(request: Request): Promise<string | undefined> {
    const id = await o.user(request)
    return typeof id === 'string' && id ? id : undefined
  }

  async function find(userId: string, id: string): Promise<Resolved> {
    const s = resolveAll(await load(userId)).find(x => x.id === id)
    if (!s) throw new HttpError(404, `Unknown server "${id}"`)
    return s
  }

  async function list(userId: string): Promise<Response> {
    return json({ servers: entries(await load(userId)) })
  }

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new HttpError(400, 'Invalid JSON body')
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object')
    return body as Record<string, unknown>
  }

  async function addServer(userId: string, request: Request): Promise<Response> {
    if (!o.allowCustom) throw new HttpError(403, 'Adding servers is not allowed')
    const body = await readBody(request)
    if (typeof body.url !== 'string') throw new HttpError(400, 'url is required')
    const input = body.url.trim()
    const url = checkUrl(input)
    if (url instanceof Error) throw new HttpError(400, url.message)
    if (o.allowHosts && !matchesHost(url.hostname, o.allowHosts)) {
      throw new HttpError(400, `${url.hostname} is not an allowed MCP host`)
    }
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : url.host
    const id = await update(userId, (d) => {
      const taken = (x: string) => resolveAll(d).some(s => s.id === x)
      const base = idFromHost(url)
      let next = base
      for (let n = 2; taken(next); n++) next = `${base}-${n}`
      d.custom.push({ id: next, url: input, name })
      d.enabled.push(next)
      delete d.states[next]
      return next
    }) as string
    await connectServer(userId, { id, name, url: input, custom: true })
    return json({ id, servers: entries(await load(userId)) }, 201)
  }

  async function removeServer(userId: string, id: string): Promise<Response> {
    const s = await find(userId, id)
    if (!s.custom) throw new HttpError(400, `"${id}" is in the catalog; disable it instead`)
    await authFor(userId, s).logout()
    await storage.remove(`${userPrefix(userId)}discovery:${s.url}`)
    await update(userId, (d) => {
      d.custom = d.custom.filter(c => c.id !== id)
      d.enabled = d.enabled.filter(x => x !== id)
      delete d.states[id]
      return true
    })
    invalidate(userId, id)
    return list(userId)
  }

  async function authorize(userId: string, s: Resolved): Promise<Response> {
    if (s.unsupported) throw new HttpError(400, s.unsupported)
    await update(userId, (d) => {
      if (d.enabled.includes(s.id)) return false
      d.enabled.push(s.id)
      return true
    })
    invalidate(userId, s.id)
    const { auth, client } = clientFor(userId, s)
    try {
      const result = await client.connect()
      if (result.status === 'ready') {
        await client.close()
        await record(userId, s.id, { state: 'connected' })
        return json({ url: null })
      }
      const { url, state } = await auth.startAuthorization()
      const index: StateIndex = { userId, serverId: s.id, expiresAt: Date.now() + STATE_TTL_SECONDS * 1000 }
      await storage.set(stateKey(state), JSON.stringify(index), { ttl: STATE_TTL_SECONDS })
      await record(userId, s.id, { state: 'needs-auth' })
      return json({ url })
    } catch (error) {
      const f = failure(error)
      await record(userId, s.id, f)
      return json({ error: f.error }, 502)
    }
  }

  async function action(userId: string, s: Resolved, name: string): Promise<Response> {
    if (name === 'authorize') return authorize(userId, s)
    if (name === 'enable') {
      await update(userId, (d) => {
        if (d.enabled.includes(s.id)) return false
        d.enabled.push(s.id)
        return true
      })
      if (!s.unsupported) await connectServer(userId, s)
    } else if (name === 'disable') {
      await update(userId, (d) => {
        if (!d.enabled.includes(s.id)) return false
        d.enabled = d.enabled.filter(x => x !== s.id)
        return true
      })
      invalidate(userId, s.id)
    } else {
      await authFor(userId, s).logout()
      invalidate(userId, s.id)
      await record(userId, s.id, { state: 'needs-auth' })
    }
    return list(userId)
  }

  /** The OAuth redirect target: finds the user through the single-use `state`, never through `user()` */
  async function callback(url: URL): Promise<Response> {
    const state = url.searchParams.get('state')
    if (!state) return callbackPage(400, { ok: false, error: 'The sign-in response has no state' })
    const key = stateKey(state)
    const index = parse<StateIndex>(await storage.get(key))
    await storage.remove(key)
    if (!index || typeof index.userId !== 'string' || Date.now() >= index.expiresAt) {
      return callbackPage(400, { ok: false, error: 'This sign-in link expired or was already used; try again' })
    }
    const id = index.serverId
    const s = resolveAll(await load(index.userId)).find(x => x.id === id)
    if (!s) return callbackPage(400, { id, ok: false, error: `Unknown server "${id}"` })
    try {
      await authFor(index.userId, s).finishAuthorization({
        state,
        code: url.searchParams.get('code') ?? undefined,
        error: url.searchParams.get('error') ?? undefined,
        errorDescription: url.searchParams.get('error_description') ?? undefined,
      })
    } catch (error) {
      const f = failure(error)
      await record(index.userId, id, f)
      return callbackPage(200, { id, ok: false, error: f.error })
    }
    invalidate(index.userId, id)
    await record(index.userId, id, { state: 'connected' })
    return callbackPage(200, { id, ok: true })
  }

  async function callbackPage(status: number, result: { id?: string; ok: boolean; error?: string }): Promise<Response> {
    const message = { type: MESSAGE_TYPE, ...result }
    const script = `(function () {
  var message = ${scriptJSON(message)};
  try { if (window.opener) window.opener.postMessage(message, ${scriptJSON(frontendOrigin)}) } catch (e) {}
  try { var channel = new BroadcastChannel(${scriptJSON(CHANNEL)}); channel.postMessage(message); channel.close() } catch (e) {}
  window.close()
})()`
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script))
    let bin = ''
    for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b)
    const text = result.ok ? 'Connected. You can close this window.' : 'Sign-in did not complete. You can close this window.'
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sign-in</title></head><body><p>${text}</p><script>${script}</script></body></html>`
    return new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${btoa(bin)}'; base-uri 'none'; frame-ancestors 'none'`,
      },
    })
  }

  /**
   * Request-level policy for every route (the place for Origin and CORS checks).
   * Returns a response to stop the request, or `undefined` to let it through.
   */
  function guard(_request: Request, _route: string): Response | undefined {
    return undefined
  }

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
      throw new HttpError(404, 'Not found')
    }
    let segments: string[]
    try {
      segments = url.pathname.slice(basePath.length).split('/').filter(Boolean).map(decodeURIComponent)
    } catch {
      throw new HttpError(400, 'Malformed path')
    }
    const method = request.method
    const [head, id, verb, ...rest] = segments
    const known = rest.length === 0 && (
      (head === 'callback' && !id)
      || (head === 'servers' && (!verb || ACTIONS.has(verb)))
    )
    if (!known) throw new HttpError(404, 'Not found')
    const routeName = head === 'callback' ? 'callback' : verb ?? (id ? 'server' : 'servers')

    const blocked = guard(request, routeName)
    if (blocked) return blocked

    if (head === 'callback') {
      if (method !== 'GET') throw new HttpError(405, 'Method not allowed')
      return callback(url)
    }

    const userId = await resolveUser(request)
    if (!userId) throw new HttpError(401, 'Not signed in')

    if (!id) {
      if (method === 'GET') return list(userId)
      if (method === 'POST') return addServer(userId, request)
      throw new HttpError(405, 'Method not allowed')
    }
    if (!verb) {
      if (method !== 'DELETE') throw new HttpError(405, 'Method not allowed')
      return removeServer(userId, id)
    }
    if (method !== 'POST') throw new HttpError(405, 'Method not allowed')
    return action(userId, await find(userId, id), verb)
  }

  return {
    async handler(request) {
      try {
        return await route(request)
      } catch (error) {
        if (error instanceof HttpError) return json({ error: error.message }, error.status)
        return json({ error: 'Internal error' }, 500)
      }
    },

    async toolsFor(request) {
      const userId = await resolveUser(request)
      if (!userId) return []
      const d = await load(userId)
      const active = resolveAll(d).filter(s => d.enabled.includes(s.id) && !s.unsupported)
      const lists = await Promise.all(active.map(s => connectServer(userId, s).catch(() => [])))
      return lists.flat()
    },
  }
}
