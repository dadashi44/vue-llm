// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createLLMHandler, createMCPConnector, type MCPConnectorOptions } from '../../src/server.js'
import type { ChatStreamChunk, LLMProvider } from '../../src/providers/types.js'
import { decryptValue, encryptValue } from '../../src/mcp/crypto.js'
import type { MCPAuthStorage } from '../../src/mcp/storage.js'
import type { MCPServerPreset } from '../../src/mcp/servers.js'

/*
 * A fake world on one local HTTP server, addressed by host name through an injected fetch:
 * - auth.test     OAuth authorization server with dynamic registration
 * - ghauth.test   OAuth authorization server without registration (GitHub-style)
 * - mcp.test, mcp2.test  MCP servers protected by auth.test
 * - gh.test       MCP server protected by ghauth.test
 * - open.test     MCP server without auth
 * - slow.test     MCP server without auth that also has a `sleep` tool
 * - down.test     unreachable (fetch throws TypeError)
 */

const APP = 'https://app.example.com'
const GH_CLIENT = { clientId: 'gh-client', clientSecret: 'gh-secret' }

interface Grant { challenge: string; clientId: string; redirectUri: string }

const world = {
  base: '',
  expiresIn: 3600,
  registrations: 0,
  tokenRequests: [] as { host: string; body: URLSearchParams }[],
  codes: new Map<string, Grant>(),
  issuedCodes: [] as string[],
  access: new Set<string>(),
  refresh: new Set<string>(),
  issued: [] as string[],
  hangRequests: 0,
  hanging: [] as ServerResponse[],
  /** MCP servers stop answering tools/list (the request hangs) */
  hangList: false,
  reset() {
    this.hangList = false
    this.hangRequests = 0
    for (const res of this.hanging.splice(0)) res.end()
    this.expiresIn = 3600
    this.registrations = 0
    this.tokenRequests = []
    this.codes.clear()
    this.issuedCodes = []
    this.access.clear()
    this.refresh.clear()
    this.issued = []
  },
  revokeAll() {
    this.access.clear()
    this.refresh.clear()
  },
}

const testFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname === 'down.test') throw new TypeError('fetch failed')
  const headers = new Headers(input instanceof Request ? input.headers : init?.headers)
  headers.set('X-Test-Host', url.hostname)
  return fetch(`${world.base}${url.pathname}${url.search}`, { ...init, headers })
}

function makeMcpServer(host: string): McpServer {
  const server = new McpServer({ name: host, version: '1.0.0' })
  server.registerTool('echo', {
    description: `Echo from ${host}`,
    inputSchema: { text: z.string() },
  }, async ({ text }) => ({ content: [{ type: 'text', text: `${host}: ${text}` }] }))
  server.registerTool('add', {
    description: 'Adds two numbers',
    inputSchema: { a: z.number(), b: z.number() },
  }, async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] }))
  if (host === 'slow.test') server.registerTool('sleep', {
    description: 'Answers after ms milliseconds',
    inputSchema: { ms: z.number() },
  }, async ({ ms }) => {
    await new Promise(resolve => setTimeout(resolve, ms))
    return { content: [{ type: 'text', text: 'awake' }] }
  })
  return server
}

async function readText(req: IncomingMessage): Promise<string> {
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of req) text += decoder.decode(chunk, { stream: true })
  return text + decoder.decode()
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
}

async function s256(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  let bin = ''
  for (const b of digest) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function issueTokens(res: ServerResponse) {
  const access = `at-${crypto.randomUUID()}`
  const refresh = `rt-${crypto.randomUUID()}`
  world.access.add(access)
  world.refresh.add(refresh)
  world.issued.push(access, refresh)
  json(res, 200, { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: world.expiresIn })
}

async function authServer(host: string, path: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  const issuer = `https://${host}`
  if (path === '/.well-known/oauth-authorization-server') {
    return json(res, 200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      ...(host === 'auth.test' ? { registration_endpoint: `${issuer}/register` } : {}),
      code_challenge_methods_supported: ['S256'],
    })
  }
  if (path === '/register' && host === 'auth.test') {
    world.registrations++
    return json(res, 201, { client_id: `dyn-${world.registrations}` })
  }
  if (path === '/authorize') {
    const q = url.searchParams
    const code = `code-${crypto.randomUUID()}`
    world.codes.set(code, {
      challenge: q.get('code_challenge')!,
      clientId: q.get('client_id')!,
      redirectUri: q.get('redirect_uri')!,
    })
    world.issuedCodes.push(code)
    const back = new URL(q.get('redirect_uri')!)
    back.searchParams.set('code', code)
    back.searchParams.set('state', q.get('state')!)
    res.writeHead(302, { Location: back.toString() }).end()
    return
  }
  if (path === '/token') {
    const body = new URLSearchParams(await readText(req))
    world.tokenRequests.push({ host, body })
    if (host === 'ghauth.test'
      && (body.get('client_id') !== GH_CLIENT.clientId || body.get('client_secret') !== GH_CLIENT.clientSecret)) {
      return json(res, 401, { error: 'invalid_client' })
    }
    if (body.get('grant_type') === 'authorization_code') {
      const grant = world.codes.get(body.get('code') ?? '')
      world.codes.delete(body.get('code') ?? '')
      if (!grant || grant.redirectUri !== body.get('redirect_uri')
        || grant.challenge !== await s256(body.get('code_verifier') ?? '')) {
        return json(res, 400, { error: 'invalid_grant' })
      }
      return issueTokens(res)
    }
    if (body.get('grant_type') === 'refresh_token') {
      const token = body.get('refresh_token') ?? ''
      if (!world.refresh.delete(token)) return json(res, 400, { error: 'invalid_grant' })
      return issueTokens(res)
    }
    return json(res, 400, { error: 'unsupported_grant_type' })
  }
  json(res, 404, { error: 'not found' })
}

async function mcpServer(host: string, path: string, req: IncomingMessage, res: ServerResponse) {
  if (host === 'hang.test') {
    // Accepts the request and never answers
    world.hangRequests++
    world.hanging.push(res)
    return
  }
  const protectedBy = host === 'open.test' || host === 'slow.test' ? undefined : host === 'gh.test' ? 'https://ghauth.test' : 'https://auth.test'
  if (path === '/.well-known/oauth-protected-resource/mcp' && protectedBy) {
    return json(res, 200, { resource: `https://${host}/mcp`, authorization_servers: [protectedBy] })
  }
  if (path !== '/mcp') return json(res, 404, { error: 'not found' })
  const auth = req.headers['authorization']
  const token = typeof auth === 'string' ? auth.replace(/^Bearer /, '') : ''
  if (protectedBy && !world.access.has(token)) {
    res.writeHead(401, {
      'WWW-Authenticate': `Bearer resource_metadata="https://${host}/.well-known/oauth-protected-resource/mcp"`,
    }).end()
    return
  }
  const text = req.method === 'POST' ? await readText(req) : ''
  if (world.hangList && text.includes('"tools/list"')) {
    world.hanging.push(res)
    return
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const server = makeMcpServer(host)
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, text ? JSON.parse(text) : undefined)
}

let http: Server

beforeAll(async () => {
  http = createServer((req, res) => {
    const host = String(req.headers['x-test-host'])
    const url = new URL(req.url ?? '/', 'http://local')
    const run = host.endsWith('auth.test')
      ? authServer(host, url.pathname, req, res, url)
      : mcpServer(host, url.pathname, req, res)
    run.catch((error: unknown) => res.writeHead(500).end(String(error)))
  })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  world.base = `http://127.0.0.1:${(http.address() as { port: number }).port}`
})

afterAll(async () => {
  world.reset()
  http.closeAllConnections()
  await new Promise<void>(resolve => http.close(() => resolve()))
})

beforeEach(() => world.reset())

// --- connector helpers ---------------------------------------------------------------

const demo: MCPServerPreset = { id: 'demo', name: 'Demo', url: 'https://mcp.test/mcp', modes: ['browser', 'server'] }
const github: MCPServerPreset = { id: 'gh', name: 'GitHub', url: 'https://gh.test/mcp', modes: ['server'], oauth: GH_CLIENT }
const open = { id: 'open', name: 'Open', url: 'https://open.test/mcp' }
const browserOnly: MCPServerPreset = { id: 'bo', name: 'Browser only', url: 'https://bo.test/mcp', modes: ['browser'] }
const down = { id: 'down', name: 'Down', url: 'https://down.test/mcp' }
const hang = { id: 'hang', name: 'Hang', url: 'https://hang.test/mcp' }

function memoryStore() {
  const data = new Map<string, string>()
  const store: MCPAuthStorage = {
    get: key => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value)
    },
    remove: key => {
      data.delete(key)
    },
  }
  return { data, store }
}

/** Test DNS: every fake host is public, `*.internal.test` is private */
const testResolve = vi.fn(async (host: string) => (host.endsWith('.internal.test') ? ['10.0.0.7'] : ['93.184.216.34']))

function setup(over: Partial<MCPConnectorOptions> = {}) {
  const { data, store } = memoryStore()
  const user = vi.fn((r: Request) => r.headers.get('X-User'))
  const connector = createMCPConnector({
    basePath: '/api/mcp',
    publicUrl: APP,
    servers: [demo, github, open, browserOnly, down],
    allowCustom: true,
    user,
    store,
    secret: 'test-secret-that-is-long-enough',
    fetch: testFetch,
    resolve: testResolve,
    ...over,
  })
  const bodies: string[] = []
  /** Bodies of every response but the callback page (which relays the code to the opener by design) */
  const apiBodies: string[] = []

  async function handle(request: Request): Promise<Response> {
    const response = await connector.handler(request)
    const text = await response.clone().text()
    bodies.push(text)
    if (new URL(request.url).pathname !== '/api/mcp/callback') apiBodies.push(text)
    return response
  }

  function call(method: string, path: string, o: { user?: string | null; body?: unknown; origin?: string | null } = {}) {
    const headers = new Headers()
    const origin = o.origin === undefined ? APP : o.origin
    if (origin) headers.set('Origin', origin)
    const who = o.user === undefined ? 'alice' : o.user
    if (who) headers.set('X-User', who)
    if (o.body !== undefined) headers.set('Content-Type', 'application/json')
    return handle(new Request(`${APP}/api/mcp${path}`, {
      method,
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    }))
  }

  async function list(who = 'alice') {
    const response = await call('GET', '/servers', { user: who })
    expect(response.status).toBe(200)
    return (await response.json()).servers as Array<Record<string, unknown>>
  }

  async function entry(id: string, who = 'alice') {
    return (await list(who)).find(s => s.id === id)
  }

  /** POST /authorize and follow the provider redirect: the callback page is not loaded yet */
  async function startSignIn(id: string, who = 'alice') {
    const response = await call('POST', `/servers/${id}/authorize`, { user: who })
    expect(response.status).toBe(200)
    const { url, state } = await response.json() as { url: string; state: string }
    const redirect = await testFetch(url, { redirect: 'manual' })
    expect(redirect.status).toBe(302)
    return { authorizeUrl: url, state, callbackUrl: redirect.headers.get('Location')! }
  }

  /** The callback page and the message it posts to the opener */
  async function loadCallback(callbackUrl: string) {
    const callback = await handle(new Request(callbackUrl))
    const html = await callback.clone().text()
    const match = /var message = (\{.*?\});/.exec(html)
    const message = match ? JSON.parse(match[1]) as Record<string, string | undefined> : undefined
    return { callback, html, message }
  }

  /** What the frontend does with the callback message: POST /servers/:id/complete */
  function complete(id: string, message: Record<string, unknown>, who: string | null = 'alice') {
    const { state, code, error, errorDescription } = message
    return call('POST', `/servers/${id}/complete`, { user: who, body: { state, code, error, errorDescription } })
  }

  /** The whole flow: authorize, provider redirect, callback page, then /complete as the frontend does */
  async function signIn(id: string, who = 'alice') {
    const started = await startSignIn(id, who)
    const { callback, message } = await loadCallback(started.callbackUrl)
    expect(message).toMatchObject({ id, state: started.state })
    const completed = await complete(id, message!, who)
    expect(completed.status).toBe(200)
    return { ...started, callback, completed }
  }

  function toolsFor(who: string | null = 'alice') {
    const headers = new Headers()
    if (who) headers.set('X-User', who)
    return connector.toolsFor(new Request(`${APP}/api/chat`, { method: 'POST', headers }))
  }

  return { connector, data, store, user, call, list, entry, startSignIn, loadCallback, complete, signIn, toolsFor, bodies, apiBodies, handle }
}

const ctx = { toolCallId: 'call_1' }

// --- tests ---------------------------------------------------------------------------

describe('encryptValue / decryptValue', () => {
  it('round-trips with a random IV and rejects the wrong secret', async () => {
    const a = await encryptValue('s1', 'hello')
    const b = await encryptValue('s1', 'hello')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a).not.toContain('hello')
    await expect(decryptValue('s1', a)).resolves.toBe('hello')
    await expect(decryptValue('s2', a)).rejects.toThrow()
  })
})

describe('createMCPConnector', () => {
  it('GET /servers returns the catalog with needs-auth', async () => {
    const t = setup()
    expect(await t.list()).toEqual([
      { id: 'demo', name: 'Demo', url: 'https://mcp.test/mcp', custom: false, enabled: false, state: 'needs-auth' },
      { id: 'gh', name: 'GitHub', url: 'https://gh.test/mcp', custom: false, enabled: false, state: 'needs-auth' },
      { id: 'open', name: 'Open', url: 'https://open.test/mcp', custom: false, enabled: false, state: 'needs-auth' },
      expect.objectContaining({ id: 'bo', custom: false, enabled: false, state: 'unsupported', error: expect.any(String) }),
      { id: 'down', name: 'Down', url: 'https://down.test/mcp', custom: false, enabled: false, state: 'needs-auth' },
    ])
  })

  it('authorize returns the provider URL and its state, and stores a pending state for the user', async () => {
    const t = setup()
    const response = await t.call('POST', '/servers/demo/authorize')
    expect(response.status).toBe(200)
    const { url, state: returned } = await response.json() as { url: string; state: string }
    const authorize = new URL(url)
    expect(authorize.origin + authorize.pathname).toBe('https://auth.test/authorize')
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${APP}/api/mcp/callback`)
    expect(authorize.searchParams.get('client_id')).toBe('dyn-1')
    expect(authorize.searchParams.get('resource')).toBe('https://mcp.test/mcp')
    const state = authorize.searchParams.get('state')!
    expect(returned).toBe(state)
    expect(t.data.has(`state:${state}`)).toBe(true)
    expect(t.data.has(`u:alice:pending:${state}`)).toBe(true)
    expect(await t.entry('demo')).toMatchObject({ enabled: true, state: 'needs-auth' })
  })

  it('the callback page alone stores nothing: it relays the response and keeps the state', async () => {
    const t = setup()
    const { state, callbackUrl } = await t.startSignIn('demo')
    const calls = t.user.mock.calls.length
    const { callback, message } = await t.loadCallback(callbackUrl)
    expect(t.user.mock.calls.length).toBe(calls)
    expect(callback.status).toBe(200)
    expect(message).toEqual({
      type: 'vue-llm:mcp-callback',
      id: 'demo',
      state,
      code: new URL(callbackUrl).searchParams.get('code'),
    })
    expect(world.tokenRequests).toHaveLength(0)
    expect([...t.data.keys()].some(k => k.includes(':tokens:'))).toBe(false)
    expect(t.data.has(`state:${state}`)).toBe(true)
    expect(t.data.has(`u:alice:pending:${state}`)).toBe(true)
    expect(await t.entry('demo')).toMatchObject({ state: 'needs-auth' })
  })

  it('/complete by the user who started the flow finishes it and returns the servers', async () => {
    const t = setup()
    const { completed } = await t.signIn('demo')
    const body = await completed.json() as { servers: Array<Record<string, unknown>> }
    expect(body.servers.find(s => s.id === 'demo')).toMatchObject({ enabled: true, state: 'connected' })
    expect(t.data.has('u:alice:tokens:https://mcp.test/mcp')).toBe(true)
    expect([...t.data.keys()].some(k => k.startsWith('state:'))).toBe(false)
    expect([...t.data.keys()].some(k => k.includes(':pending:'))).toBe(false)
  })

  it('/complete with another user\'s session is refused and stores no tokens for either user', async () => {
    const t = setup()
    // The attacker starts the flow; the victim approves and her browser loads the callback page
    const { state, callbackUrl } = await t.startSignIn('demo', 'mallory')
    const { message } = await t.loadCallback(callbackUrl)
    await t.call('POST', '/servers/demo/enable', { user: 'victim' })
    const refused = await t.complete('demo', message!, 'victim')
    expect(refused.status).toBe(403)
    expect(world.tokenRequests).toHaveLength(0)
    expect([...t.data.keys()].some(k => k.includes(':tokens:'))).toBe(false)
    expect(await t.entry('demo', 'mallory')).toMatchObject({ state: 'needs-auth' })
    expect(await t.entry('demo', 'victim')).toMatchObject({ state: 'needs-auth' })
    // Not consumed by the refusal
    expect(t.data.has(`state:${state}`)).toBe(true)
  })

  it('/complete refuses a state started for another server', async () => {
    const t = setup()
    const { state, callbackUrl } = await t.startSignIn('demo')
    await t.call('POST', '/servers/open/enable')
    const { message } = await t.loadCallback(callbackUrl)
    const refused = await t.complete('open', message!)
    expect(refused.status).toBe(403)
    expect(world.tokenRequests).toHaveLength(0)
    expect(t.data.has(`state:${state}`)).toBe(true)
  })

  it('/complete rejects a reused or unknown state', async () => {
    const t = setup()
    const { callbackUrl } = await t.signIn('demo')
    const { message } = await t.loadCallback(callbackUrl)
    const again = await t.complete('demo', message!)
    expect(again.status).toBe(400)
    expect(world.tokenRequests).toHaveLength(1)
    expect((await t.complete('demo', { state: 'nope', code: 'x' })).status).toBe(400)
    expect((await t.call('POST', '/servers/demo/complete', { body: { code: 'x' } })).status).toBe(400)
  })

  it('returns HTML that posts to the frontend origin', async () => {
    const t = setup({ allowedOrigins: ['https://front.example.com', APP] })
    const { callbackUrl } = await t.startSignIn('demo')
    const { callback, html } = await t.loadCallback(callbackUrl)
    expect(callback.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(callback.headers.get('Cache-Control')).toBe('no-store')
    expect(callback.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(callback.headers.get('Content-Security-Policy')).toMatch(/script-src 'sha256-[^']+'.*frame-ancestors 'none'/)
    expect(html).toContain('postMessage')
    expect(html).toContain('"https://front.example.com"')
    expect(html).toContain('window.close()')
    // The callback page is on another origin than the frontend: no BroadcastChannel
    expect(html).not.toContain('BroadcastChannel')

    const same = setup()
    const { html: sameHtml } = await same.loadCallback((await same.startSignIn('demo')).callbackUrl)
    expect(sameHtml).toContain('BroadcastChannel')
    expect(sameHtml).toContain('"vue-llm:mcp"')
  })

  it('callback escapes provider-controlled text', async () => {
    const t = setup()
    const response = await t.call('POST', '/servers/demo/authorize')
    const state = new URL((await response.json() as { url: string }).url).searchParams.get('state')!
    const { html, message } = await t.loadCallback(
      `${APP}/api/mcp/callback?state=${state}&error=access_denied&error_description=${encodeURIComponent('</script><script>alert(1)</script>\u2028')}`,
    )
    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).not.toContain('\u2028')
    expect(html).toContain('\\u003c/script')
    expect(message).toMatchObject({ id: 'demo', state, error: 'access_denied' })
    expect((await t.complete('demo', message!)).status).toBe(200)
    expect(await t.entry('demo')).toMatchObject({ state: 'needs-auth', error: expect.stringContaining('access_denied') })
  })

  it('callback with an unknown state shows an error page', async () => {
    const t = setup()
    const { callback, message } = await t.loadCallback(`${APP}/api/mcp/callback?state=nope&code=x`)
    expect(callback.status).toBe(400)
    expect(message).not.toHaveProperty('code')
    expect(message).not.toHaveProperty('id')
  })

  it('toolsFor returns prefixed tools for connected servers only', async () => {
    const t = setup()
    await t.signIn('demo')
    await t.call('POST', '/servers/gh/enable')
    const tools = await t.toolsFor()
    expect(tools.map(tool => tool.name).sort()).toEqual(['demo_add', 'demo_echo'])
    const echo = tools.find(tool => tool.name === 'demo_echo')!
    await expect(echo.execute({ text: 'hi' }, ctx)).resolves.toBe('mcp.test: hi')
    expect(await t.entry('gh')).toMatchObject({ enabled: true, state: 'needs-auth' })
    expect(await t.toolsFor('bob')).toEqual([])
    expect(await t.toolsFor(null)).toEqual([])
  })

  it('connects servers without auth on enable and lists their tools', async () => {
    const t = setup()
    await t.call('POST', '/servers/open/enable')
    const tools = await t.toolsFor()
    expect(tools.map(tool => tool.name).sort()).toEqual(['open_add', 'open_echo'])
    expect(await t.entry('open')).toMatchObject({ state: 'connected' })
  })

  it('toolsFor refreshes expired tokens and saves them', async () => {
    const t = setup()
    world.expiresIn = 30 // inside the refresh skew: already expired
    await t.signIn('demo')
    const key = 'u:alice:tokens:https://mcp.test/mcp'
    const before = await decryptValue('test-secret-that-is-long-enough', t.data.get(key)!)
    world.expiresIn = 3600
    const tools = await t.toolsFor()
    expect(tools.map(tool => tool.name)).toContain('demo_echo')
    expect(world.tokenRequests.filter(r => r.body.get('grant_type') === 'refresh_token')).toHaveLength(1)
    const after = await decryptValue('test-secret-that-is-long-enough', t.data.get(key)!)
    expect(JSON.parse(after).access_token).not.toBe(JSON.parse(before).access_token)
    expect(world.access.has(JSON.parse(after).access_token)).toBe(true)
  })

  it('a server failing with invalid_grant is skipped and becomes needs-auth', async () => {
    const t = setup()
    world.expiresIn = 30
    await t.signIn('demo')
    await t.call('POST', '/servers/open/enable')
    world.revokeAll()
    const tools = await t.toolsFor()
    expect(tools.map(tool => tool.name).sort()).toEqual(['open_add', 'open_echo'])
    expect(await t.entry('demo')).toMatchObject({ state: 'needs-auth' })
    expect(t.data.has('u:alice:tokens:https://mcp.test/mcp')).toBe(false)
  })

  it('an unreachable server is skipped and becomes error with a network message', async () => {
    const t = setup()
    await t.call('POST', '/servers/down/enable')
    await expect(t.toolsFor()).resolves.toEqual([])
    const item = await t.entry('down')
    expect(item).toMatchObject({ state: 'error' })
    expect(String(item!.error)).toMatch(/could not reach down\.test/i)
    expect(String(item!.error)).not.toMatch(/server mode/i)
  })

  it('stored tokens are encrypted', async () => {
    const t = setup()
    await t.signIn('demo')
    expect(world.issued.length).toBeGreaterThan(0)
    for (const value of t.data.values()) {
      for (const token of world.issued) expect(value).not.toContain(token)
      expect(value).not.toContain('access_token')
    }
    const raw = t.data.get('u:alice:tokens:https://mcp.test/mcp')!
    const plain = await decryptValue('test-secret-that-is-long-enough', raw)
    expect(world.access.has(JSON.parse(plain).access_token)).toBe(true)
  })

  it('stores plaintext without a secret', async () => {
    const t = setup({ secret: undefined })
    await t.signIn('demo')
    expect(t.data.get('u:alice:tokens:https://mcp.test/mcp')).toContain('access_token')
  })

  it('no provider token appears in any response body', async () => {
    const t = setup()
    world.expiresIn = 30
    await t.list()
    await t.signIn('demo')
    await t.signIn('gh')
    world.expiresIn = 3600
    await t.toolsFor()
    await t.call('POST', '/servers', { body: { url: 'https://mcp2.test/mcp' } })
    await t.signIn('mcp2')
    await t.list()
    await t.call('POST', '/servers/demo/disable')
    await t.call('POST', '/servers/demo/enable')
    await t.call('POST', '/servers/demo/authorize')
    await t.call('POST', '/servers/gh/logout')
    await t.call('DELETE', '/servers/mcp2')
    expect(world.issued.length).toBeGreaterThanOrEqual(6)
    expect(t.apiBodies.length).toBeGreaterThanOrEqual(12)
    for (const body of t.bodies) {
      for (const secret of [...world.issued, GH_CLIENT.clientSecret]) {
        expect(body).not.toContain(secret)
      }
    }
    // Authorization codes reach only the callback page, which relays them to the opener
    for (const body of t.apiBodies) {
      for (const code of world.issuedCodes) expect(body).not.toContain(code)
    }
  })

  it('user() returning null gives 401 on every route except callback', async () => {
    const t = setup()
    const routes: [string, string, unknown?][] = [
      ['GET', '/servers'],
      ['POST', '/servers', { url: 'https://mcp2.test/mcp' }],
      ['DELETE', '/servers/demo'],
      ['POST', '/servers/demo/enable'],
      ['POST', '/servers/demo/disable'],
      ['POST', '/servers/demo/authorize'],
      ['POST', '/servers/demo/logout'],
      ['POST', '/servers/demo/complete', { state: 'x', code: 'y' }],
    ]
    for (const [method, path, body] of routes) {
      const response = await t.call(method, path, { user: null, body })
      expect(response.status, `${method} ${path}`).toBe(401)
      expect(await response.json()).toEqual({ error: expect.any(String) })
    }
    const before = t.user.mock.calls.length
    const callback = await t.call('GET', '/callback?state=nope&code=x', { user: null })
    expect(callback.status).toBe(400)
    expect(callback.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(t.user.mock.calls.length).toBe(before)
  })

  it('answers unknown routes and servers with 404 and bad input with 400', async () => {
    const t = setup()
    expect((await t.call('GET', '/nope')).status).toBe(404)
    expect((await t.call('POST', '/servers/nope/enable')).status).toBe(404)
    expect((await t.call('POST', '/servers/demo/nope')).status).toBe(404)
    expect((await t.handle(new Request(`${APP}/elsewhere/servers`))).status).toBe(404)
    expect((await t.call('POST', '/servers', { body: { url: 'not a url' } })).status).toBe(400)
    expect((await t.call('POST', '/servers', { body: { url: 'http://example.com/mcp' } })).status).toBe(400)
    const bad = await t.handle(new Request(`${APP}/api/mcp/servers`, {
      method: 'POST',
      headers: { 'X-User': 'alice', 'Origin': APP, 'Content-Type': 'application/json' },
      body: '{',
    }))
    expect(bad.status).toBe(400)
    expect((await t.call('DELETE', '/servers/demo')).status).toBe(400)
    expect((await t.call('POST', '/servers/bo/authorize')).status).toBe(400)
  })

  it('POST /servers adds a custom server and DELETE removes it with its tokens', async () => {
    const t = setup()
    const added = await t.call('POST', '/servers', { body: { url: ' https://mcp2.test/mcp ', name: 'Second' } })
    expect(added.status).toBe(201)
    const { id } = await added.json() as { id: string }
    expect(id).toBe('mcp2')
    expect(await t.entry('mcp2')).toEqual({
      id: 'mcp2', name: 'Second', url: 'https://mcp2.test/mcp', custom: true, enabled: true, state: 'needs-auth',
    })
    expect(await t.entry('mcp2', 'bob')).toBeUndefined()

    await t.signIn('mcp2')
    expect((await t.toolsFor()).map(tool => tool.name)).toContain('mcp2_echo')
    expect(t.data.has('u:alice:tokens:https://mcp2.test/mcp')).toBe(true)

    // The same URL again: no second entry sharing (and on removal, signing out) the first one's tokens
    for (const url of ['https://mcp2.test/mcp', 'https://MCP2.test/mcp/', 'https://mcp2.test:443/mcp#x']) {
      const second = await t.call('POST', '/servers', { body: { url } })
      expect(second.status, url).toBe(409)
      expect(await second.json()).toMatchObject({ id: 'mcp2', error: expect.any(String), servers: expect.any(Array) })
    }
    const catalogUrl = await t.call('POST', '/servers', { body: { url: 'https://mcp.test/mcp' } })
    expect(catalogUrl.status).toBe(409)
    expect((await catalogUrl.json()).id).toBe('demo')
    expect((await t.list()).filter(s => s.custom)).toHaveLength(1)

    const removed = await t.call('DELETE', '/servers/mcp2')
    expect(removed.status).toBe(200)
    expect(await t.entry('mcp2')).toBeUndefined()
    expect(t.data.has('u:alice:tokens:https://mcp2.test/mcp')).toBe(false)
    expect((await t.toolsFor()).map(tool => tool.name)).not.toContain('mcp2_echo')
  })

  it('limits custom servers: 20 per user, url up to 2048 and name up to 100 characters', async () => {
    const t = setup()
    const long = await t.call('POST', '/servers', { body: { url: `https://open.test/mcp?q=${'a'.repeat(2048)}` } })
    expect(long.status).toBe(400)
    const named = await t.call('POST', '/servers', { body: { url: 'https://open.test/mcp?n=0', name: 'n'.repeat(101) } })
    expect(named.status).toBe(400)
    expect((await t.call('POST', '/servers', { body: { url: 'https://open.test/mcp?n=0', name: 'n'.repeat(100) } })).status).toBe(201)
    for (let n = 1; n < 20; n++) {
      expect((await t.call('POST', '/servers', { body: { url: `https://open.test/mcp?n=${n}` } })).status).toBe(201)
    }
    const over = await t.call('POST', '/servers', { body: { url: 'https://open.test/mcp?n=20' } })
    expect(over.status).toBe(400)
    expect((await over.json()).error).toMatch(/20/)
    expect((await t.list()).filter(s => s.custom)).toHaveLength(20)
    // Per user
    expect((await t.call('POST', '/servers', { body: { url: 'https://open.test/mcp?n=20' }, user: 'bob' })).status).toBe(201)
  })

  it('refuses custom servers without allowCustom and outside allowHosts', async () => {
    const off = setup({ allowCustom: false })
    expect((await off.call('POST', '/servers', { body: { url: 'https://mcp2.test/mcp' } })).status).toBe(403)
    const hosts = setup({ allowHosts: ['*.allowed.test'] })
    expect((await hosts.call('POST', '/servers', { body: { url: 'https://mcp2.test/mcp' } })).status).toBe(400)
  })

  it('enable/disable change the entry and toolsFor respects them', async () => {
    const t = setup()
    await t.signIn('demo')
    expect((await t.toolsFor()).length).toBe(2)
    const disabled = await t.call('POST', '/servers/demo/disable')
    expect(disabled.status).toBe(200)
    expect((await disabled.json()).servers.find((s: { id: string }) => s.id === 'demo')).toMatchObject({ enabled: false })
    expect(await t.toolsFor()).toEqual([])
    expect(t.data.has('u:alice:tokens:https://mcp.test/mcp')).toBe(true)
    await t.call('POST', '/servers/demo/enable')
    expect(await t.entry('demo')).toMatchObject({ enabled: true, state: 'connected' })
    expect((await t.toolsFor()).length).toBe(2)
  })

  it('logout forgets tokens', async () => {
    const t = setup()
    await t.signIn('demo')
    expect((await t.toolsFor()).length).toBe(2)
    const response = await t.call('POST', '/servers/demo/logout')
    expect(response.status).toBe(200)
    expect(t.data.has('u:alice:tokens:https://mcp.test/mcp')).toBe(false)
    expect(await t.entry('demo')).toMatchObject({ state: 'needs-auth' })
    expect(await t.toolsFor()).toEqual([])
  })

  it('keeps users apart', async () => {
    const t = setup()
    await t.signIn('demo', 'alice')
    expect(await t.entry('demo', 'bob')).toMatchObject({ enabled: false, state: 'needs-auth' })
    expect(await t.toolsFor('bob')).toEqual([])
  })

  it('GitHub-style preset uses the configured oauth client instead of registration', async () => {
    const t = setup()
    const { authorizeUrl, callback } = await t.signIn('gh')
    expect(new URL(authorizeUrl).searchParams.get('client_id')).toBe('gh-client')
    expect(world.registrations).toBe(0)
    expect(callback.status).toBe(200)
    const exchange = world.tokenRequests.find(r => r.host === 'ghauth.test')!
    expect(exchange.body.get('client_secret')).toBe('gh-secret')
    expect((await t.toolsFor()).map(tool => tool.name).sort()).toEqual(['gh_add', 'gh_echo'])
  })

  it('include and exclude limit the tools of a server', async () => {
    const t = setup({ servers: [{ ...open, include: ['echo'] }, { id: 'open2', url: 'https://open.test/mcp', exclude: ['echo'] }] })
    await t.call('POST', '/servers/open/enable')
    await t.call('POST', '/servers/open2/enable')
    expect((await t.toolsFor()).map(tool => tool.name)).toEqual(['open_echo', 'open2_add'])
    // A preset with a filter
    const p = setup({ servers: [{ ...demo, include: ['add'] }] })
    await p.signIn('demo')
    expect((await p.toolsFor()).map(tool => tool.name)).toEqual(['demo_add'])
  })

  it('a re-list that times out does not abort tool calls running on the same connection', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const t = setup({ servers: [{ id: 'slow', url: 'https://slow.test/mcp' }], timeout: 300 })
      await t.call('POST', '/servers/slow/enable')
      const sleep = (await t.toolsFor()).find(tool => tool.name === 'slow_sleep')!
      // The cached connection expires: the next toolsFor lists the tools again on it
      vi.setSystemTime(Date.now() + 61_000)
      world.hangList = true
      const listing = t.toolsFor()
      await vi.waitFor(() => expect(world.hanging.length).toBe(1), { interval: 5 })
      // A chat runs a tool while the re-list waits
      const running = sleep.execute({ ms: 500 }, ctx)
      await listing
      await expect(running).resolves.toBe('awake')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reuses connections for a short time', async () => {
    const counting = vi.fn(testFetch)
    const t = setup({ fetch: counting })
    await t.signIn('demo')
    const first = await t.toolsFor()
    const calls = counting.mock.calls.length
    const second = await t.toolsFor()
    expect(counting.mock.calls.length).toBe(calls)
    expect(second.map(tool => tool.name)).toEqual(first.map(tool => tool.name))
    await t.call('POST', '/servers/demo/logout')
    expect(await t.toolsFor()).toEqual([])
  })

  it('gives createLLMHandler the tools of the requesting user', async () => {
    const t = setup()
    await t.signIn('demo')
    const requests: { tools?: { name: string }[] }[] = []
    const scripts: ChatStreamChunk[][] = [
      [
        { type: 'tool-call-start', toolCallId: 'call_1', toolName: 'demo_echo' },
        { type: 'tool-call-delta', toolCallId: 'call_1', args: '{"text":"from chat"}' },
        { type: 'tool-call-end', toolCallId: 'call_1' },
        { type: 'finish', finishReason: 'tool-calls' },
      ],
      [{ type: 'text-delta', text: 'Done.' }, { type: 'finish', finishReason: 'stop' }],
    ]
    const provider: LLMProvider = {
      id: 'mock',
      supportsStreaming: true,
      validateConfig: () => {},
      chat: async (request) => {
        requests.push(request)
        const chunks = scripts.shift()!
        return {
          stream: new ReadableStream<ChatStreamChunk>({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk)
              controller.close()
            },
          }),
          response: Promise.resolve({ finishReason: 'stop' as const }),
        }
      },
    }
    const handler = createLLMHandler({ provider, tools: request => t.connector.toolsFor(request) })
    const response = await handler(new Request(`${APP}/api/chat`, {
      method: 'POST',
      headers: { 'X-User': 'alice', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'echo' }] }),
    }))
    const text = await response.text()
    expect(requests[0].tools?.map(tool => tool.name).sort()).toEqual(['demo_add', 'demo_echo'])
    expect(text).toContain('mcp.test: from chat')
    for (const token of world.issued) expect(text).not.toContain(token)
  })

  it('a hanging server times out, is skipped, becomes error and is not retried at once', async () => {
    const t = setup({ servers: [open, hang], timeout: 300 })
    await t.call('POST', '/servers/open/enable')
    let started = Date.now()
    expect((await t.call('POST', '/servers/hang/enable')).status).toBe(200)
    expect(Date.now() - started).toBeLessThan(2000)
    const item = await t.entry('hang')
    expect(item).toMatchObject({ enabled: true, state: 'error' })
    expect(String(item!.error)).toMatch(/timed out connecting to hang\.test/i)

    // A fresh instance on the same store: the toolsFor path, without any cached connection
    const t2 = setup({ servers: [open, hang], timeout: 300, store: t.store })
    started = Date.now()
    const tools = await t2.toolsFor()
    const elapsed = Date.now() - started
    expect(tools.map(tool => tool.name).sort()).toEqual(['open_add', 'open_echo'])
    expect(elapsed).toBeGreaterThanOrEqual(250)
    expect(elapsed).toBeLessThan(2000)

    const requests = world.hangRequests
    started = Date.now()
    expect((await t2.toolsFor()).map(tool => tool.name).sort()).toEqual(['open_add', 'open_echo'])
    expect(Date.now() - started).toBeLessThan(200)
    expect(world.hangRequests).toBe(requests)
  })

  it('authorize on a hanging server fails within the timeout', async () => {
    const t = setup({ servers: [hang], timeout: 300 })
    const started = Date.now()
    const response = await t.call('POST', '/servers/hang/authorize')
    expect(Date.now() - started).toBeLessThan(2000)
    expect(response.status).toBe(502)
    expect((await response.json()).error).toMatch(/timed out connecting to hang\.test/i)
    expect(await t.entry('hang')).toMatchObject({ state: 'error' })
  })
})

describe('createMCPConnector: shared registrations and scopes', () => {
  it('two users signing in to the same server register the client once', async () => {
    const t = setup()
    await t.signIn('demo', 'alice')
    await t.signIn('demo', 'bob')
    expect(world.registrations).toBe(1)
    expect(t.data.has('shared:client:https://auth.test')).toBe(true)
    expect([...t.data.keys()].some(k => k.startsWith('u:') && k.includes(':client:'))).toBe(false)
    expect(t.data.has('u:alice:tokens:https://mcp.test/mcp')).toBe(true)
    expect(t.data.has('u:bob:tokens:https://mcp.test/mcp')).toBe(true)
    expect(await t.entry('demo', 'bob')).toMatchObject({ state: 'connected' })
  })

  it('passes preset oauth scopes as the scope', async () => {
    const t = setup({ servers: [{ ...github, oauth: { ...GH_CLIENT, scopes: ['repo', 'read:org'] } }] })
    const response = await t.call('POST', '/servers/gh/authorize')
    const { url } = await response.json() as { url: string }
    expect(new URL(url).searchParams.get('scope')).toBe('repo read:org')
  })
})

describe('createMCPConnector security', () => {
  function preflight(t: ReturnType<typeof setup>, origin: string) {
    return t.handle(new Request(`${APP}/api/mcp/servers/demo/enable`, {
      method: 'OPTIONS',
      headers: { 'Origin': origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    }))
  }

  it('answers preflight only for allowedOrigins with credentials', async () => {
    const FRONT = 'https://front.example.com'
    const t = setup({ allowedOrigins: [FRONT] })
    const ok = await preflight(t, FRONT)
    expect(ok.status).toBe(204)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(FRONT)
    expect(ok.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(ok.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, DELETE')
    expect(ok.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
    expect(ok.headers.get('Vary')).toContain('Origin')

    for (const origin of ['https://evil.example.com', APP]) {
      const bad = await preflight(t, origin)
      expect(bad.status, origin).toBe(403)
      expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull()
      expect(bad.headers.get('Access-Control-Allow-Credentials')).toBeNull()
    }

    // Default: the origin of publicUrl
    expect((await preflight(setup(), APP)).status).toBe(204)
    expect((await preflight(setup(), FRONT)).status).toBe(403)

    // Responses to allowed origins carry the CORS headers
    const listed = await t.call('GET', '/servers', { origin: FRONT })
    expect(listed.status).toBe(200)
    expect(listed.headers.get('Access-Control-Allow-Origin')).toBe(FRONT)
    expect(listed.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(listed.headers.get('Vary')).toContain('Origin')
    const enabled = await t.call('POST', '/servers/open/enable', { origin: FRONT })
    expect(enabled.status).toBe(200)
    expect(enabled.headers.get('Access-Control-Allow-Origin')).toBe(FRONT)
  })

  it('rejects a mutating request with a foreign or missing Origin', async () => {
    const t = setup()
    const routes: [string, string, unknown?][] = [
      ['POST', '/servers', { url: 'https://mcp2.test/mcp' }],
      ['DELETE', '/servers/demo'],
      ['POST', '/servers/demo/enable'],
      ['POST', '/servers/demo/disable'],
      ['POST', '/servers/demo/authorize'],
      ['POST', '/servers/demo/logout'],
      ['POST', '/servers/demo/complete', { state: 'x', code: 'y' }],
    ]
    for (const origin of ['https://evil.example.com', 'null', null]) {
      for (const [method, path, body] of routes) {
        const response = await t.call(method, path, { body, origin })
        expect(response.status, `${method} ${path} from ${origin}`).toBe(403)
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
      }
    }
    expect(await t.entry('demo')).toMatchObject({ enabled: false })
    expect((await t.list()).some(s => s.custom)).toBe(false)
    expect(world.registrations).toBe(0)

    // GET: a foreign Origin is rejected, a missing one (same-origin GET) is allowed
    expect((await t.call('GET', '/servers', { origin: 'https://evil.example.com' })).status).toBe(403)
    const sameOrigin = await t.call('GET', '/servers', { origin: null })
    expect(sameOrigin.status).toBe(200)
    expect(sameOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull()

    // The callback is a top-level navigation from the provider: exempt
    const callback = await t.call('GET', '/callback?state=nope&code=x', { origin: 'https://auth.test' })
    expect(callback.status).toBe(400)
    expect(callback.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
  })

  it('refuses to start without secret when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() => setup({ secret: undefined })).toThrow(/secret/)
      expect(() => setup()).not.toThrow()
    } finally {
      vi.unstubAllEnvs()
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const t = setup({ secret: undefined })
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toMatch(/secret/)
      void t
      setup()
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('rejects custom servers on private, loopback or metadata addresses', async () => {
    const t = setup()
    for (const url of [
      'https://127.0.0.1/mcp',
      'https://10.0.0.1/mcp',
      'https://[::1]/mcp',
      'http://localhost:3000/mcp',
      'https://169.254.169.254/mcp',
      'https://db.internal.test/mcp',
    ]) {
      const response = await t.call('POST', '/servers', { body: { url } })
      expect(response.status, url).toBe(400)
    }
    expect((await t.list()).some(s => s.custom)).toBe(false)
  })

  it('guards metadata URLs taken from responses', async () => {
    const counting = vi.fn(testFetch)
    // auth.test (named by the servers' metadata) resolves to a private address
    const resolve = async (host: string) => (host === 'auth.test' ? ['10.0.0.9'] : ['93.184.216.34'])
    const t = setup({ fetch: counting, resolve })
    expect((await t.call('POST', '/servers', { body: { url: 'https://mcp2.test/mcp' } })).status).toBe(201)
    const custom = await t.call('POST', '/servers/mcp2/authorize')
    expect(custom.status).toBe(502)
    expect((await custom.json()).error).toMatch(/auth\.test/)
    expect(await t.entry('mcp2')).toMatchObject({ state: 'unsupported' })
    // A catalog server's own host is trusted; the hosts its metadata names are not
    const catalog = await t.call('POST', '/servers/demo/authorize')
    expect(catalog.status).toBe(502)
    expect(counting.mock.calls.some(([input]) => new URL(String(input)).hostname === 'auth.test')).toBe(false)
    expect(counting.mock.calls.some(([input]) => new URL(String(input)).hostname === 'mcp.test')).toBe(true)
  })

  it('allowHosts restricts custom servers and the hosts their sign-in reaches', async () => {
    const narrow = setup({ allowHosts: ['mcp2.test'] })
    expect((await narrow.call('POST', '/servers', { body: { url: 'https://mcp2.test/mcp' } })).status).toBe(201)
    expect((await narrow.call('POST', '/servers/mcp2/authorize')).status).toBe(502)
    // Catalog servers are not limited by allowHosts
    expect((await narrow.call('POST', '/servers/demo/authorize')).status).toBe(200)

    // allowHosts alone is enough without a DNS resolver
    const t = setup({ allowHosts: ['mcp2.test', 'auth.test'], resolve: null })
    expect((await t.call('POST', '/servers', { body: { url: 'https://mcp2.test/mcp' } })).status).toBe(201)
    await t.signIn('mcp2')
    expect((await t.toolsFor()).map(tool => tool.name)).toContain('mcp2_echo')
  })

  it('connector refuses allowCustom without allowHosts when no resolver is available', async () => {
    expect(() => setup({ resolve: null })).toThrow(/allowHosts/)
    expect(() => setup({ resolve: null, allowCustom: false })).not.toThrow()
    expect(() => setup({ resolve: null, allowHosts: ['*.test'] })).not.toThrow()

    // Found out lazily when node:dns can't be loaded (edge runtimes)
    vi.resetModules()
    vi.doMock('../../src/mcp/ssrf.js', async importOriginal => ({
      ...await importOriginal<typeof import('../../src/mcp/ssrf.js')>(),
      loadNodeResolver: async () => undefined,
    }))
    try {
      const { createMCPConnector: create } = await import('../../src/mcp/connector.js')
      const { store } = memoryStore()
      const connector = create({
        basePath: '/api/mcp', publicUrl: APP, servers: [open], allowCustom: true,
        user: () => 'alice', store, secret: 'test-secret-that-is-long-enough', fetch: testFetch,
      })
      const add = await connector.handler(new Request(`${APP}/api/mcp/servers`, {
        method: 'POST',
        headers: { 'Origin': APP, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://mcp2.test/mcp' }),
      }))
      expect(add.status).toBe(500)
      expect((await add.json()).error).toMatch(/allowHosts/)
      const list = await connector.handler(new Request(`${APP}/api/mcp/servers`, { headers: { Origin: APP } }))
      expect(list.status).toBe(200)
      const enabled = await connector.handler(new Request(`${APP}/api/mcp/servers/open/enable`, { method: 'POST', headers: { Origin: APP } }))
      expect(enabled.status).toBe(200)
    } finally {
      vi.doUnmock('../../src/mcp/ssrf.js')
      vi.resetModules()
    }
  })
})
