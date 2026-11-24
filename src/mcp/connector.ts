import { createMCPAuth, type MCPAuth } from './auth.js'
import { createMCPClient, type MCPHttpClient } from './client.js'
import { decryptValue, encryptValue } from './crypto.js'
import { MCPAuthError, MCPHTTPError, MCPProtocolError, MCPUnsupportedServerError } from './errors.js'
import type { MCPServerPreset, MCPToolFilter } from './servers.js'
import { assertPublicHost, guardedFetch, loadNodeResolver, type MCPHostResolver } from './ssrf.js'
import type { MCPAuthStorage } from './storage.js'
import { mcpTools, type MCPTool } from './tools.js'
import { checkCustom, idFromHost, MAX_CUSTOM_SERVERS, sameServerUrl } from './url.js'

/** A server in `createMCPConnector({ servers })` that isn't a preset */
export interface MCPConnectorServer extends MCPToolFilter {
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
  /**
   * Frontend origins allowed to call the routes (CORS with credentials, CSRF check on `Origin`);
   * default the origin of `publicUrl`. The first one receives the callback message
   */
  allowedOrigins?: string[]
  /** The catalog every user can turn on; `include` / `exclude` limit a server's tools */
  servers: ((MCPServerPreset & MCPToolFilter) | MCPConnectorServer)[]
  /**
   * Lets users add servers by URL. Default `false`. The backend then fetches URLs chosen by
   * users: private, loopback and link-local addresses are always refused, and without
   * `allowHosts` every host is resolved and refused if it points inside the network
   * (needs `node:dns`: on runtimes without it `allowHosts` is required)
   */
  allowCustom?: boolean
  /**
   * Host patterns (`example.com`, `*.example.com`) for custom servers and every host their
   * sign-in reaches (metadata, authorization server). Recommended in production: the DNS check
   * alone can't rule out DNS rebinding. Catalog servers are not limited by it
   */
  allowHosts?: string[]
  /** Whose connections these are: a stable user id, or `null` when signed out (401) */
  user: (request: Request) => string | null | Promise<string | null>
  /** Where tokens, client registrations and each user's list live (any async key-value store) */
  store: MCPAuthStorage
  /**
   * Encrypts every stored value (AES-GCM). Required when `NODE_ENV` is `production`;
   * without it (in development) values are stored in plain text and a warning is logged
   */
  secret?: string
  /** Shown on the providers' consent screens; default the host of `publicUrl` */
  clientName?: string
  /** Used for every outbound request (discovery, registration, tokens, MCP); default `globalThis.fetch` */
  fetch?: typeof fetch
  /**
   * Deadline in ms for connecting to one server (sign-in checks, token refresh, `initialize`,
   * listing tools). A server that misses it is skipped and shown as `error`. Default `10_000`
   */
  timeout?: number
  /**
   * Resolves host names for the SSRF check of hosts the developer didn't configure. Default:
   * `node:dns` where it loads; `null` means no resolver (then `allowCustom` needs `allowHosts`).
   * For tests and custom DNS
   */
  resolve?: MCPHostResolver | null
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
  include?: string[]
  exclude?: string[]
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
  /** Set only while (re)connecting, so later tool calls aren't bound by it */
  deadline: Deadline
}

interface CacheEntry {
  url: string
  expiresAt: number
  /** The connect failed: kept for FAILURE_TTL_MS so the chat doesn't wait on it again */
  failed: boolean
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
/**
 * A server that failed to connect (timeout, error, sign-in needed) is not retried by `toolsFor`
 * for 30 s, so consecutive chat requests don't each wait for it. `enable`, `authorize`,
 * `complete` and `logout` clear it at once on this instance.
 */
const FAILURE_TTL_MS = 30_000
const DEFAULT_TIMEOUT_MS = 10_000
const CHANNEL = 'vue-llm:mcp'
const MESSAGE_TYPE = 'vue-llm:mcp-callback'
const ACTIONS = new Set(['enable', 'disable', 'authorize', 'complete', 'logout'])
/** Where the client registration per authorization server is stored, shared by all users */
const SHARED_PREFIX = 'shared:'
const NO_RESOLVER = 'createMCPConnector: allowCustom without allowHosts needs a DNS resolver (node:dns), which this runtime does not have. Set allowHosts'

/** A server-side network failure (DNS, refused, TLS): not the browser's CORS case */
class MCPNetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MCPNetworkError'
  }
}

/** The connector can't do this safely with its configuration */
class MCPConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MCPConfigError'
  }
}

class MCPTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MCPTimeoutError'
  }
}

/** Aborts when either signal aborts */
function anySignal(a: AbortSignal | null | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b])
  const controller = new AbortController()
  const abort = (s: AbortSignal) => () => controller.abort(s.reason)
  if (a.aborted) controller.abort(a.reason)
  else if (b.aborted) controller.abort(b.reason)
  else {
    a.addEventListener('abort', abort(a), { once: true })
    b.addEventListener('abort', abort(b), { once: true })
  }
  return controller.signal
}

/** A deadline that the requests of one connect attempt follow while it is set */
interface Deadline {
  signal?: AbortSignal
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
  if (error instanceof MCPTimeoutError || error instanceof MCPNetworkError || error instanceof MCPConfigError || error instanceof MCPHTTPError || error instanceof MCPProtocolError) {
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
  const origins = (o.allowedOrigins ?? [publicOrigin]).map((value) => {
    try {
      return new URL(value).origin
    } catch {
      throw new Error(`createMCPConnector: allowedOrigins must be origins such as https://app.example.com, got "${value}"`)
    }
  })
  const allowedOrigins = new Set(origins)
  const frontendOrigin = origins[0] ?? publicOrigin
  if (o.allowCustom && !o.allowHosts && o.resolve === null) throw new Error(NO_RESOLVER)
  if (!o.secret) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    if (env?.NODE_ENV === 'production') {
      throw new Error('createMCPConnector: secret is required in production; it encrypts the stored tokens')
    }
    console.warn('[vue-llm] createMCPConnector: no secret, so tokens are stored unencrypted. Set secret (required when NODE_ENV is production)')
  }
  const clientName = o.clientName ?? new URL(publicUrl).host
  const storage = wrapStore(o.store, o.secret)
  const timeoutMs = o.timeout ?? DEFAULT_TIMEOUT_MS

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
      ...(s.include ? { include: s.include } : {}),
      ...(s.exclude ? { exclude: s.exclude } : {}),
      ...(modes && !modes.includes('server') ? { unsupported: `${name} works only in browser mode` } : {}),
    })
  }

  const baseFetch: typeof fetch = o.fetch ?? ((...args) => globalThis.fetch(...args))
  /** Hosts of the developer's catalog: trusted, though their redirects are still checked */
  const trustedHosts = new Set<string>()
  for (const s of catalog) {
    try {
      trustedHosts.add(new URL(s.url).host.toLowerCase())
    } catch {
      throw new Error(`createMCPConnector: server "${s.id}" has an invalid url`)
    }
  }
  const isTrusted = (url: URL) => trustedHosts.has(url.host.toLowerCase())

  let resolver: Promise<MCPHostResolver | undefined> | undefined
  /** The DNS resolver, loaded once; DNS failures surface as network errors */
  function getResolver(): Promise<MCPHostResolver | undefined> {
    resolver ??= (o.resolve !== undefined ? Promise.resolve(o.resolve ?? undefined) : loadNodeResolver()).then(
      resolve => resolve && (async (host: string) => {
        try {
          return await resolve(host)
        } catch {
          throw new MCPNetworkError(`Could not resolve ${host}`)
        }
      }),
    )
    return resolver
  }

  /** Custom servers can be guarded: by allowHosts, or by the DNS check */
  async function assertCustomAllowed() {
    if (!o.allowHosts && !(await getResolver())) throw new HttpError(500, NO_RESOLVER)
  }

  /**
   * Every outbound request for server `s` (discovery, registration, tokens, MCP) goes through
   * here: SSRF-guarded (catalog hosts trusted; `allowHosts` applied for custom servers), with
   * network failures reported as such.
   */
  function outboundFetch(s: Resolved): typeof fetch {
    return async (input, init) => {
      const resolve = await getResolver()
      if (s.custom && !o.allowHosts && !resolve) throw new MCPConfigError(NO_RESOLVER)
      const guarded = guardedFetch(baseFetch, {
        allowHosts: s.custom ? o.allowHosts : undefined,
        resolve,
        trusted: isTrusted,
      })
      try {
        return await guarded(input, init)
      } catch (error) {
        if (error instanceof TypeError) throw new MCPNetworkError(`Could not reach ${hostOf(input)}`)
        throw error
      }
    }
  }

  /**
   * Runs one connect step against `url` under the deadline: its requests are aborted through
   * `deadline.signal`, and the race makes sure a step that ignores the signal can't block either.
   */
  async function withDeadline<T>(url: string, deadline: Deadline, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new MCPTimeoutError(`Timed out connecting to ${hostOf(url)}`)
        controller.abort(error)
        reject(error)
      }, timeoutMs)
    })
    deadline.signal = controller.signal
    try {
      return await Promise.race([run(controller.signal), timedOut])
    } finally {
      clearTimeout(timer)
      deadline.signal = undefined
    }
  }

  /** `outboundFetch` that also follows the deadline while one is set */
  function deadlineFetch(s: Resolved, deadline: Deadline): typeof fetch {
    const fetchFn = outboundFetch(s)
    return (input, init) => {
      const signal = deadline.signal
      return fetchFn(input, signal ? { ...init, signal: anySignal(init?.signal, signal) } : init)
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

  function authFor(userId: string, s: Resolved, deadline: Deadline = {}): MCPAuth {
    return createMCPAuth({
      serverUrl: s.url,
      storage,
      pendingStorage: storage,
      keyPrefix: userPrefix(userId),
      // One registration per authorization server for all users (the redirect URI is the same)
      clientKeyPrefix: SHARED_PREFIX,
      clientName,
      redirectUri,
      fetch: deadlineFetch(s, deadline),
      ...(s.oauth ? { client: { client_id: s.oauth.clientId, client_secret: s.oauth.clientSecret } } : {}),
      ...(s.oauth?.scopes?.length ? { scope: s.oauth.scopes.join(' ') } : {}),
    })
  }

  function clientFor(userId: string, s: Resolved, deadline: Deadline = {}): { auth: MCPAuth; client: MCPHttpClient } {
    const auth = authFor(userId, s, deadline)
    return { auth, client: createMCPClient({ url: s.url, auth, fetch: deadlineFetch(s, deadline) }) }
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
        // Its own deadline: the connection's is read by every request on it, so setting that one
        // would abort the tool calls a chat runs meanwhile. The listing follows `signal` alone
        const tools = await withDeadline(s.url, {}, signal => mcpTools(prev.client, { prefix: s.id, include: s.include, exclude: s.exclude, signal }))
        await record(userId, s.id, { state: 'connected' })
        return { ...prev, tools }
      } catch {
        // The session or token went stale (or the server stopped answering): reconnect below
      }
    }
    const deadline: Deadline = {}
    const { client } = clientFor(userId, s, deadline)
    try {
      const connection = await withDeadline(s.url, deadline, async (signal) => {
        const result = await client.connect()
        if (result.status === 'needs-auth') return undefined
        return { client, deadline, tools: await mcpTools(client, { prefix: s.id, include: s.include, exclude: s.exclude, signal }) }
      })
      await record(userId, s.id, { state: connection ? 'connected' : 'needs-auth' })
      return connection
    } catch (error) {
      await record(userId, s.id, failure(error))
      return undefined
    }
  }

  /**
   * The server's tools for this user, reusing a cached connection; `[]` when it can't connect.
   * `fresh` skips a cached failure (an explicit enable or add retries at once).
   */
  async function connectServer(userId: string, s: Resolved, fresh = false): Promise<MCPTool[]> {
    const key = cacheKey(userId, s.id)
    const hit = cache.get(key)
    const usable = hit && hit.url === s.url && Date.now() < hit.expiresAt && !(fresh && hit.failed)
    if (usable) return (await hit.result)?.tools ?? []
    const entry: CacheEntry = {
      url: s.url,
      expiresAt: Infinity, // shared by concurrent callers while connecting
      failed: false,
      result: open(userId, s, hit?.url === s.url ? hit.result : undefined),
    }
    cache.set(key, entry)
    const connection = await entry.result.catch(() => undefined)
    if (cache.get(key) === entry) {
      entry.failed = !connection
      entry.expiresAt = Date.now() + (connection ? CONNECTION_TTL_MS : FAILURE_TTL_MS)
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
    const given = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined
    const url = checkCustom(input, given)
    if (url instanceof Error) throw new HttpError(400, url.message)
    const known = (d: UserData) => resolveAll(d).find(s => sameServerUrl(s.url, url))
    const current = await load(userId)
    const existing = known(current)
    if (existing) return duplicate(userId, existing.id)
    if (current.custom.length >= MAX_CUSTOM_SERVERS) throw new HttpError(400, `At most ${MAX_CUSTOM_SERVERS} servers can be added`)
    await assertCustomAllowed()
    if (!isTrusted(url)) {
      try {
        await assertPublicHost(url, { allowHosts: o.allowHosts, resolve: await getResolver() })
      } catch (error) {
        if (error instanceof MCPUnsupportedServerError || error instanceof MCPNetworkError) throw new HttpError(400, error.message)
        throw error
      }
    }
    const name = given ?? url.host
    let found: string | undefined
    let full = false
    const id = await update(userId, (d) => {
      // Checked again under the lock: a concurrent add may have taken the URL or the last slot
      found = known(d)?.id
      full = d.custom.length >= MAX_CUSTOM_SERVERS
      if (found || full) return false
      const taken = (x: string) => resolveAll(d).some(s => s.id === x)
      const base = idFromHost(url)
      let next = base
      for (let n = 2; taken(next); n++) next = `${base}-${n}`
      d.custom.push({ id: next, url: input, name })
      d.enabled.push(next)
      delete d.states[next]
      return next
    })
    if (found) return duplicate(userId, found)
    if (full || id === false) throw new HttpError(400, `At most ${MAX_CUSTOM_SERVERS} servers can be added`)
    await connectServer(userId, { id, name, url: input, custom: true }, true)
    return json({ id, servers: entries(await load(userId)) }, 201)
  }

  /** A server with this URL is already in the user's list: a second entry would share its tokens */
  async function duplicate(userId: string, id: string): Promise<Response> {
    return json({ error: `This server is already in the list as "${id}"`, id, servers: entries(await load(userId)) }, 409)
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
    const deadline: Deadline = {}
    const { auth, client } = clientFor(userId, s, deadline)
    try {
      const started = await withDeadline(s.url, deadline, async () => {
        const result = await client.connect()
        return result.status === 'ready' ? undefined : auth.startAuthorization()
      })
      if (!started) {
        void client.close()
        await record(userId, s.id, { state: 'connected' })
        return json({ url: null })
      }
      const { url, state } = started
      const index: StateIndex = { userId, serverId: s.id, expiresAt: Date.now() + STATE_TTL_SECONDS * 1000 }
      await storage.set(stateKey(state), JSON.stringify(index), { ttl: STATE_TTL_SECONDS })
      await record(userId, s.id, { state: 'needs-auth' })
      return json({ url, state })
    } catch (error) {
      const f = failure(error)
      await record(userId, s.id, f)
      return json({ error: f.error }, 502)
    }
  }

  async function action(userId: string, s: Resolved, name: string): Promise<Response> {
    if (s.custom && name !== 'disable') await assertCustomAllowed()
    if (name === 'authorize') return authorize(userId, s)
    if (name === 'enable') {
      await update(userId, (d) => {
        if (d.enabled.includes(s.id)) return false
        d.enabled.push(s.id)
        return true
      })
      if (!s.unsupported) await connectServer(userId, s, true)
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

  /**
   * `POST /servers/:id/complete`: finishes a sign-in with the authorization response that the
   * callback page relayed to the frontend. Only the user who started the flow (the `state`
   * records them) can complete it, so a sign-in link handed to someone else can't attach their
   * account to the sender's user. A refused request leaves the state for its owner.
   */
  async function complete(userId: string, id: string, request: Request): Promise<Response> {
    const body = await readBody(request)
    const text = (name: string) => (typeof body[name] === 'string' && body[name] ? body[name] as string : undefined)
    const state = text('state')
    if (!state) throw new HttpError(400, 'state is required')
    const key = stateKey(state)
    const index = parse<StateIndex>(await storage.get(key))
    if (!index || typeof index.userId !== 'string' || Date.now() >= index.expiresAt) {
      throw new HttpError(400, 'This sign-in expired or was already used; try again')
    }
    if (index.userId !== userId || index.serverId !== id) {
      throw new HttpError(403, 'This sign-in was started by another user or for another server')
    }
    await storage.remove(key)
    const s = await find(userId, id)
    try {
      const deadline: Deadline = {}
      const auth = authFor(userId, s, deadline)
      await withDeadline(s.url, deadline, () => auth.finishAuthorization({
        state,
        code: text('code'),
        error: text('error'),
        errorDescription: text('errorDescription'),
      }))
    } catch (error) {
      await record(userId, id, failure(error))
      return list(userId)
    }
    invalidate(userId, id)
    await record(userId, id, { state: 'connected' })
    return list(userId)
  }

  /**
   * The OAuth redirect target. It completes nothing: the page hands the authorization response
   * to the window that opened it (on the frontend origin), whose app then calls `complete` with
   * the user's own session. The state is only read here, to name the server, and stays unused.
   */
  async function callback(url: URL): Promise<Response> {
    const state = url.searchParams.get('state')
    if (!state) return callbackPage(400, { error: 'invalid_request', errorDescription: 'The sign-in response has no state' })
    const index = parse<StateIndex>(await storage.get(stateKey(state)))
    if (!index || typeof index.serverId !== 'string' || Date.now() >= index.expiresAt) {
      return callbackPage(400, { error: 'invalid_state', errorDescription: 'This sign-in link expired or was already used; try again' })
    }
    const param = (name: string) => url.searchParams.get(name) ?? undefined
    const error = param('error')
    const errorDescription = param('error_description')
    const code = param('code')
    return callbackPage(200, {
      id: index.serverId,
      state,
      ...(code !== undefined ? { code } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(errorDescription !== undefined ? { errorDescription } : {}),
    })
  }

  async function callbackPage(
    status: number,
    result: { id?: string; state?: string; code?: string; error?: string; errorDescription?: string },
  ): Promise<Response> {
    const message = { type: MESSAGE_TYPE, ...result }
    // The page is on the backend's origin: the channel reaches the frontend only when it shares it
    const channel = publicOrigin === frontendOrigin
      ? `\n  try { var channel = new BroadcastChannel(${scriptJSON(CHANNEL)}); channel.postMessage(message); channel.close() } catch (e) {}`
      : ''
    const script = `(function () {
  var message = ${scriptJSON(message)};
  try { if (window.opener) window.opener.postMessage(message, ${scriptJSON(frontendOrigin)}) } catch (e) {}${channel}
  window.close()
})()`
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script))
    let bin = ''
    for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b)
    const text = status === 200 && !result.error
      ? 'Finishing sign-in. You can close this window.'
      : 'Sign-in did not complete. You can close this window.'
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

  function corsHeaders(origin: string): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    }
  }

  /**
   * Origin and CORS policy for every route but the callback (a top-level navigation from the
   * provider). Preflights are answered for `allowedOrigins` only; a foreign `Origin` is refused
   * everywhere, and mutating routes require an allowed one (CSRF).
   * Returns a response to stop the request, or `undefined` to let it through.
   */
  function guard(request: Request, route: string): Response | undefined {
    if (route === 'callback') return undefined
    const origin = request.headers.get('Origin')
    const allowed = origin !== null && allowedOrigins.has(origin)
    if (request.method === 'OPTIONS') {
      if (!allowed) return json({ error: 'Origin not allowed' }, 403)
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          'Access-Control-Allow-Methods': 'GET, POST, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }
    if (origin !== null && !allowed) return json({ error: 'Origin not allowed' }, 403)
    const safe = request.method === 'GET' || request.method === 'HEAD'
    if (!safe && !allowed) return json({ error: 'Missing or disallowed Origin header' }, 403)
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
    if (verb === 'complete') return complete(userId, id, request)
    return action(userId, await find(userId, id), verb)
  }

  return {
    async handler(request) {
      let response: Response
      try {
        response = await route(request)
      } catch (error) {
        response = error instanceof HttpError ? json({ error: error.message }, error.status) : json({ error: 'Internal error' }, 500)
      }
      const origin = request.headers.get('Origin')
      const callbackPath = new URL(request.url).pathname === `${basePath}/callback`
      // The guard refused every other origin, so these headers only reach allowed ones
      if (origin && allowedOrigins.has(origin) && !callbackPath) {
        for (const [name, value] of Object.entries(corsHeaders(origin))) response.headers.set(name, value)
      }
      return response
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
