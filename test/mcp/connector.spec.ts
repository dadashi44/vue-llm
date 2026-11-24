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
  reset() {
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
  const protectedBy = host === 'open.test' ? undefined : host === 'gh.test' ? 'https://ghauth.test' : 'https://auth.test'
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
  await new Promise<void>(resolve => http.close(() => resolve()))
})

beforeEach(() => world.reset())

// --- connector helpers ---------------------------------------------------------------

const demo: MCPServerPreset = { id: 'demo', name: 'Demo', url: 'https://mcp.test/mcp', modes: ['browser', 'server'] }
const github: MCPServerPreset = { id: 'gh', name: 'GitHub', url: 'https://gh.test/mcp', modes: ['server'], oauth: GH_CLIENT }
const open = { id: 'open', name: 'Open', url: 'https://open.test/mcp' }
const browserOnly: MCPServerPreset = { id: 'bo', name: 'Browser only', url: 'https://bo.test/mcp', modes: ['browser'] }
const down = { id: 'down', name: 'Down', url: 'https://down.test/mcp' }

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
    ...over,
  })
  const bodies: string[] = []

  async function handle(request: Request): Promise<Response> {
    const response = await connector.handler(request)
    bodies.push(await response.clone().text())
    return response
  }

  function call(method: string, path: string, o: { user?: string | null; body?: unknown } = {}) {
    const headers = new Headers({ Origin: APP })
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

  /** POST /authorize, follow the provider redirect, then hit the callback */
  async function signIn(id: string, who = 'alice') {
    const response = await call('POST', `/servers/${id}/authorize`, { user: who })
    expect(response.status).toBe(200)
    const { url } = await response.json() as { url: string }
    const redirect = await testFetch(url, { redirect: 'manual' })
    expect(redirect.status).toBe(302)
    const callbackUrl = redirect.headers.get('Location')!
    const callback = await handle(new Request(callbackUrl))
    return { authorizeUrl: url, callbackUrl, callback }
  }

  function toolsFor(who: string | null = 'alice') {
    const headers = new Headers()
    if (who) headers.set('X-User', who)
    return connector.toolsFor(new Request(`${APP}/api/chat`, { method: 'POST', headers }))
  }

  return { connector, data, store, user, call, list, entry, signIn, toolsFor, bodies, handle }
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

  it('authorize returns the provider URL and stores a pending state for the user', async () => {
    const t = setup()
    const response = await t.call('POST', '/servers/demo/authorize')
    expect(response.status).toBe(200)
    const { url } = await response.json() as { url: string }
    const authorize = new URL(url)
    expect(authorize.origin + authorize.pathname).toBe('https://auth.test/authorize')
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${APP}/api/mcp/callback`)
    expect(authorize.searchParams.get('client_id')).toBe('dyn-1')
    expect(authorize.searchParams.get('resource')).toBe('https://mcp.test/mcp')
    const state = authorize.searchParams.get('state')!
    expect(t.data.has(`state:${state}`)).toBe(true)
    expect(t.data.has(`u:alice:pending:${state}`)).toBe(true)
    expect(await t.entry('demo')).toMatchObject({ enabled: true, state: 'needs-auth' })
  })

  it('callback completes the flow without calling user()', async () => {
    const t = setup()
    const response = await t.call('POST', '/servers/demo/authorize')
    const { url } = await response.json() as { url: string }
    const location = (await testFetch(url, { redirect: 'manual' })).headers.get('Location')!
    const calls = t.user.mock.calls.length
    const callback = await t.handle(new Request(location))
    expect(t.user.mock.calls.length).toBe(calls)
    expect(callback.status).toBe(200)
    expect(await t.entry('demo')).toMatchObject({ enabled: true, state: 'connected' })
    expect([...t.data.keys()].some(k => k.startsWith('state:'))).toBe(false)
    expect([...t.data.keys()].some(k => k.includes(':pending:'))).toBe(false)
  })

  it('returns HTML that posts to the frontend origin', async () => {
    const t = setup({ allowedOrigins: ['https://front.example.com', APP] })
    const { callback, callbackUrl } = await t.signIn('demo')
    expect(callback.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(callback.headers.get('Cache-Control')).toBe('no-store')
    const html = await callback.text()
    expect(html).toContain('postMessage')
    expect(html).toContain('"https://front.example.com"')
    expect(html).toContain('BroadcastChannel')
    expect(html).toContain('"vue-llm:mcp"')
    expect(html).toContain('window.close()')
    const message = JSON.parse(/var message = (\{.*?\});/.exec(html)![1])
    expect(message).toEqual({ type: 'vue-llm:mcp-callback', id: 'demo', ok: true })
    expect(html).not.toContain(new URL(callbackUrl).searchParams.get('code'))
  })

  it('callback escapes provider-controlled text', async () => {
    const t = setup()
    const response = await t.call('POST', '/servers/demo/authorize')
    const state = new URL((await response.json() as { url: string }).url).searchParams.get('state')!
    const callback = await t.handle(new Request(
      `${APP}/api/mcp/callback?state=${state}&error=access_denied&error_description=${encodeURIComponent('</script><script>alert(1)</script>\u2028')}`,
    ))
    const html = await callback.text()
    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).not.toContain('\u2028')
    expect(html).toContain('\\u003c/script')
    expect(await t.entry('demo')).toMatchObject({ state: 'needs-auth', error: expect.stringContaining('access_denied') })
  })

  it('callback rejects a reused state', async () => {
    const t = setup()
    const { callbackUrl } = await t.signIn('demo')
    const again = await t.handle(new Request(callbackUrl))
    expect(again.status).toBe(400)
    const html = await again.text()
    expect(html).toContain('"ok":false')
    expect(world.tokenRequests).toHaveLength(1)
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
    expect(t.bodies.length).toBeGreaterThanOrEqual(12)
    for (const body of t.bodies) {
      for (const secret of [...world.issued, ...world.issuedCodes, GH_CLIENT.clientSecret]) {
        expect(body).not.toContain(secret)
      }
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

    const second = await t.call('POST', '/servers', { body: { url: 'https://mcp2.test/mcp' } })
    expect((await second.json()).id).toBe('mcp2-2')

    const removed = await t.call('DELETE', '/servers/mcp2')
    expect(removed.status).toBe(200)
    expect(await t.entry('mcp2')).toBeUndefined()
    expect(t.data.has('u:alice:tokens:https://mcp2.test/mcp')).toBe(false)
    expect((await t.toolsFor()).map(tool => tool.name)).not.toContain('mcp2_echo')
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
})
