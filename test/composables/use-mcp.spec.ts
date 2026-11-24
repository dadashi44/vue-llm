import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import { effectScope, type EffectScope } from 'vue'
import { useMCP, type UseMCPOptions, type UseMCPReturn } from '../../src/composables/use-mcp.js'
import { MCPAuthError, MCPUnsupportedServerError } from '../../src/mcp/errors.js'

const SERVER = 'https://mcp.example.com/mcp'
const ISSUER = 'https://auth.example.com'
const PRM_URL = 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp'
const AS_URL = `${ISSUER}/.well-known/oauth-authorization-server`
const AS_META = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  registration_endpoint: `${ISSUER}/register`,
  code_challenge_methods_supported: ['S256'],
}
const PRM = { resource: SERVER, authorization_servers: [ISSUER], scopes_supported: ['read'] }
const KEY = 'vue-llm:mcp:'
// Vue 3 only APIs (the Vue 2.7 run skips the mount test)
const { version, createApp, defineComponent, h } = Vue as unknown as typeof import('vue')

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  })

interface World {
  /** Access tokens the MCP server accepts; undefined = the server needs no auth */
  validTokens?: Set<string>
  /** The CORS policy rejects `Authorization` (fetch throws) */
  blocksAuthorization?: boolean
  /** Response of the token endpoint to a refresh */
  refresh?: 'ok' | 'invalid_grant'
  sessionId?: string
}

interface Call {
  url: string
  method: string
  authorization: string | null
  body?: string
}

let events: string[]
let calls: Call[]
let scope: EffectScope | undefined

function install(world: World) {
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      authorization: headers.get('Authorization'),
      body: init?.body ? String(init.body) : undefined,
    }
    calls.push(call)
    events.push(`fetch ${url}`)

    if (url === PRM_URL) return json(PRM)
    if (url === AS_URL) return json(AS_META)
    if (url === `${ISSUER}/register`) return json({ client_id: 'cid' }, { status: 201 })
    if (url === `${ISSUER}/token`) {
      const form = new URLSearchParams(call.body)
      if (form.get('grant_type') === 'authorization_code') {
        world.validTokens?.add('fresh')
        return json({ access_token: 'fresh', token_type: 'Bearer', refresh_token: 'r1', expires_in: 3600 })
      }
      if (world.refresh === 'ok') {
        world.validTokens?.add('refreshed')
        return json({ access_token: 'refreshed', token_type: 'Bearer', expires_in: 3600 })
      }
      return json({ error: 'invalid_grant' }, { status: 400 })
    }
    if (url !== SERVER) return new Response('not found', { status: 404 })

    if (call.authorization && world.blocksAuthorization) throw new TypeError('Failed to fetch')
    if (call.method === 'DELETE') return new Response(null, { status: 200 })
    if (world.validTokens) {
      const token = call.authorization?.replace(/^Bearer /, '')
      if (!token || !world.validTokens.has(token)) {
        return new Response('unauthorized', {
          status: 401,
          headers: { 'WWW-Authenticate': `Bearer resource_metadata="${PRM_URL}", scope="read"` },
        })
      }
    }
    const body = JSON.parse(call.body!) as { id?: number; method: string; params?: { name?: string } }
    const reply = (result: unknown, extra: Record<string, string> = {}) =>
      json({ jsonrpc: '2.0', id: body.id, result }, { headers: extra })
    switch (body.method) {
      case 'initialize':
        return reply(
          { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'srv', version: '1.0.0' } },
          world.sessionId ? { 'Mcp-Session-Id': world.sessionId } : {},
        )
      case 'notifications/initialized':
        return new Response(null, { status: 202 })
      case 'tools/list':
        return reply({
          tools: [
            { name: 'search', description: 'Search', inputSchema: { type: 'object' } },
            { name: 'fetch', description: 'Fetch', inputSchema: { type: 'object' } },
          ],
        })
      case 'tools/call':
        return reply({ content: [{ type: 'text', text: `called ${body.params?.name}` }] })
    }
    return new Response('unexpected', { status: 500 })
  })
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

interface FakePopup {
  closed: boolean
  location: { href: string }
  close: () => void
}

function stubPopup(blocked = false): { open: ReturnType<typeof vi.fn>; popup: FakePopup } {
  const popup: FakePopup = {
    closed: false,
    location: { href: 'about:blank' },
    close() {
      this.closed = true
    },
  }
  const open = vi.fn(() => {
    events.push('open')
    return blocked ? null : popup
  })
  vi.stubGlobal('open', open)
  return { open, popup }
}

function setup(options: Partial<UseMCPOptions> = {}): UseMCPReturn {
  scope = effectScope()
  return scope.run(() => useMCP({ url: SERVER, ...options }))!
}

const until = (check: () => boolean) => vi.waitFor(() => expect(check()).toBe(true), { timeout: 2000, interval: 5 })

function sendCallback(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'vue-llm:mcp-callback', ...data }, origin: location.origin }))
}

function seed(tokens: Record<string, unknown>) {
  localStorage.setItem(`${KEY}tokens:${SERVER}`, JSON.stringify(tokens))
  localStorage.setItem(`${KEY}client:${ISSUER}`, JSON.stringify({ client_id: 'cid' }))
}

beforeEach(() => {
  events = []
  calls = []
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useMCP', () => {
  it('connects without auth and exposes prefixed tools', async () => {
    install({})
    const mcp = setup({ prefix: 'docs', exclude: ['fetch'] })
    await until(() => mcp.state.value === 'ready')
    expect(mcp.serverInfo.value).toEqual({ name: 'srv', version: '1.0.0' })
    expect(mcp.tools.value.map(t => t.name)).toEqual(['docs_search'])
    expect(mcp.error.value).toBeUndefined()
    await expect(mcp.tools.value[0].execute({}, { toolCallId: '1' })).resolves.toBe('called search')
  })

  it('ends in needs-auth without opening a popup on autoConnect', async () => {
    install({ validTokens: new Set() })
    const { open } = stubPopup()
    const mcp = setup()
    await until(() => mcp.state.value === 'needs-auth')
    expect(open).not.toHaveBeenCalled()
    expect(mcp.tools.value).toEqual([])
    expect(mcp.error.value).toBeUndefined()
  })

  it('authorize opens the popup synchronously before any await', async () => {
    install({ validTokens: new Set() })
    stubPopup()
    const mcp = setup({ autoConnect: false })
    expect(mcp.state.value).toBe('idle')
    void mcp.authorize()
    expect(events[0]).toBe('open')
    await until(() => mcp.authUrl.value !== undefined)
    expect(events.filter(e => e === 'open')).toHaveLength(1)
    expect(events.indexOf('open')).toBeLessThan(events.findIndex(e => e.startsWith('fetch')))
  })

  it('completes authorization from the callback message and becomes ready', async () => {
    install({ validTokens: new Set() })
    const { popup } = stubPopup()
    const mcp = setup({ prefix: 'n', clientName: 'My App' })
    await until(() => mcp.state.value === 'needs-auth')

    const done = mcp.authorize()
    expect(mcp.state.value).toBe('authorizing')
    await until(() => mcp.authUrl.value !== undefined)
    const authUrl = new URL(mcp.authUrl.value!)
    expect(popup.location.href).toBe(mcp.authUrl.value)
    expect(authUrl.searchParams.get('redirect_uri')).toBe(`${location.origin}/mcp/callback`)
    const registration = calls.find(c => c.url === `${ISSUER}/register`)!
    expect(JSON.parse(registration.body!).client_name).toBe('My App')
    // the pending flow lives in sessionStorage
    const state = authUrl.searchParams.get('state')!
    expect(sessionStorage.getItem(`${KEY}pending:${state}`)).not.toBeNull()
    expect(localStorage.getItem(`${KEY}pending:${state}`)).toBeNull()

    // another instance's flow is ignored
    sendCallback({ state: 'someone-else', code: 'x' })
    sendCallback({ state, code: 'the-code' })
    await done
    expect(mcp.state.value).toBe('ready')
    expect(mcp.authUrl.value).toBeUndefined()
    expect(mcp.tools.value.map(t => t.name)).toEqual(['n_search', 'n_fetch'])
    const exchange = calls.find(c => c.url === `${ISSUER}/token`)!
    expect(new URLSearchParams(exchange.body).get('code')).toBe('the-code')
    expect(calls.filter(c => c.url === `${ISSUER}/token`)).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(`${KEY}tokens:${SERVER}`)!).access_token).toBe('fresh')
  })

  it('resolves a relative callbackUrl against the page', async () => {
    install({ validTokens: new Set() })
    stubPopup()
    const mcp = setup({ autoConnect: false, callbackUrl: 'auth/cb' })
    void mcp.authorize()
    await until(() => mcp.authUrl.value !== undefined)
    expect(new URL(mcp.authUrl.value!).searchParams.get('redirect_uri')).toBe(new URL('auth/cb', location.href).href)
  })

  it('goes back to needs-auth with the provider error', async () => {
    install({ validTokens: new Set() })
    stubPopup()
    const mcp = setup({ autoConnect: false })
    const done = mcp.authorize()
    await until(() => mcp.authUrl.value !== undefined)
    const state = new URL(mcp.authUrl.value!).searchParams.get('state')!
    sendCallback({ state, error: 'access_denied', errorDescription: 'nope' })
    await done
    expect(mcp.state.value).toBe('needs-auth')
    expect(mcp.error.value).toBeInstanceOf(MCPAuthError)
    expect((mcp.error.value as MCPAuthError).code).toBe('access_denied')
    expect(mcp.authUrl.value).toBeUndefined()
  })

  it('goes back to needs-auth when the user closes the popup', async () => {
    install({ validTokens: new Set() })
    const { popup } = stubPopup()
    const mcp = setup({ autoConnect: false })
    const done = mcp.authorize()
    await until(() => mcp.authUrl.value !== undefined)
    popup.closed = true
    await done
    expect(mcp.state.value).toBe('needs-auth')
    expect((mcp.error.value as MCPAuthError).code).toBe('popup_closed')
  })

  it('connects on mount inside a component', async () => {
    if (!version.startsWith('3')) return
    install({})
    let mcp!: UseMCPReturn
    let fetchesDuringSetup = -1
    const app = createApp(defineComponent({
      setup() {
        mcp = useMCP({ url: SERVER })
        fetchesDuringSetup = calls.length
        return () => h('div')
      },
    }))
    app.mount(document.createElement('div'))
    expect(fetchesDuringSetup).toBe(0)
    await until(() => mcp.state.value === 'ready')
    app.unmount()
  })

  it('keeps authorizing with authUrl when the popup is blocked', async () => {
    install({ validTokens: new Set() })
    const { open } = stubPopup(true)
    const mcp = setup({ autoConnect: false })
    const done = mcp.authorize()
    expect(open).toHaveBeenCalledTimes(1)
    await until(() => mcp.authUrl.value !== undefined)
    // no popup-closed detection: still waiting well past the poll interval
    await new Promise(r => setTimeout(r, 1200))
    expect(mcp.state.value).toBe('authorizing')
    expect(mcp.authUrl.value).toContain(`${ISSUER}/authorize`)

    // the user opened the link by hand; the callback still completes the flow
    const state = new URL(mcp.authUrl.value!).searchParams.get('state')!
    sendCallback({ state, code: 'c' })
    await done
    expect(mcp.state.value).toBe('ready')
  })

  it('disconnect aborts the wait for a blocked popup', async () => {
    install({ validTokens: new Set() })
    stubPopup(true)
    const mcp = setup({ autoConnect: false })
    const done = mcp.authorize()
    await until(() => mcp.authUrl.value !== undefined)
    await mcp.disconnect()
    await done
    expect(mcp.state.value).toBe('idle')
    expect(mcp.authUrl.value).toBeUndefined()
  })

  it('refreshes an expired token on autoConnect', async () => {
    const world: World = { validTokens: new Set(), refresh: 'ok' }
    install(world)
    const { open } = stubPopup()
    seed({ access_token: 'stale', token_type: 'Bearer', refresh_token: 'r1', expires_at: Date.now() - 1000 })
    const mcp = setup()
    await until(() => mcp.state.value === 'ready')
    expect(open).not.toHaveBeenCalled()
    const refresh = calls.find(c => c.url === `${ISSUER}/token`)!
    expect(new URLSearchParams(refresh.body).get('grant_type')).toBe('refresh_token')
    const init = calls.find(c => c.url === SERVER && c.body?.includes('"initialize"'))!
    expect(init.authorization).toBe('Bearer refreshed')
    expect(calls.some(c => c.url === SERVER && c.authorization === 'Bearer stale')).toBe(false)
    expect(JSON.parse(localStorage.getItem(`${KEY}tokens:${SERVER}`)!).access_token).toBe('refreshed')
  })

  it('moves to needs-auth when a call gets 401 after refresh fails', async () => {
    const world: World = { validTokens: new Set(['good']), refresh: 'invalid_grant' }
    install(world)
    seed({ access_token: 'good', token_type: 'Bearer', refresh_token: 'r1', expires_at: Date.now() + 3600_000 })
    const mcp = setup()
    await until(() => mcp.state.value === 'ready')
    const tool = mcp.tools.value[0]

    world.validTokens!.clear() // revoked on the provider
    const call = tool.execute({}, { toolCallId: 't1' })
    await expect(call).rejects.toBeInstanceOf(MCPAuthError)
    await expect(call).rejects.toMatchObject({ code: 'unauthorized' })
    expect(mcp.state.value).toBe('needs-auth')
    expect(mcp.tools.value).toEqual([])
    expect(localStorage.getItem(`${KEY}tokens:${SERVER}`)).toBeNull()
  })

  it('fails with MCPUnsupportedServerError cors before the popup when the Authorization probe fails', async () => {
    install({ validTokens: new Set(), blocksAuthorization: true })
    const { open } = stubPopup()
    const mcp = setup()
    await until(() => mcp.state.value === 'failed')
    expect(mcp.error.value).toBeInstanceOf(MCPUnsupportedServerError)
    expect((mcp.error.value as MCPUnsupportedServerError).reason).toBe('cors')
    expect(calls.filter(c => c.authorization === 'Bearer probe')).toHaveLength(1)

    await mcp.authorize()
    expect(open).not.toHaveBeenCalled()
    expect(mcp.state.value).toBe('failed')

    // probed once per instance
    await mcp.connect()
    expect(mcp.state.value).toBe('failed')
    expect(calls.filter(c => c.authorization === 'Bearer probe')).toHaveLength(1)
  })

  it('fails with MCPUnsupportedServerError cors when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const mcp = setup()
    await until(() => mcp.state.value === 'failed')
    expect(mcp.error.value).toBeInstanceOf(MCPUnsupportedServerError)
    expect((mcp.error.value as MCPUnsupportedServerError).reason).toBe('cors')
  })

  it('logout clears tokens and goes to needs-auth', async () => {
    install({ validTokens: new Set(['good']), sessionId: 'sess-1' })
    seed({ access_token: 'good', token_type: 'Bearer', expires_at: Date.now() + 3600_000 })
    const mcp = setup()
    await until(() => mcp.state.value === 'ready')
    await mcp.logout()
    expect(mcp.state.value).toBe('needs-auth')
    expect(mcp.tools.value).toEqual([])
    expect(mcp.serverInfo.value).toBeUndefined()
    expect(localStorage.getItem(`${KEY}tokens:${SERVER}`)).toBeNull()
    expect(calls.some(c => c.method === 'DELETE')).toBe(true)
  })

  it('disconnect keeps credentials and returns to idle', async () => {
    install({ validTokens: new Set(['good']) })
    seed({ access_token: 'good', token_type: 'Bearer', expires_at: Date.now() + 3600_000 })
    const mcp = setup()
    await until(() => mcp.state.value === 'ready')
    await mcp.disconnect()
    expect(mcp.state.value).toBe('idle')
    expect(mcp.tools.value).toEqual([])
    expect(localStorage.getItem(`${KEY}tokens:${SERVER}`)).not.toBeNull()
  })

  it('disposing the scope closes the session', async () => {
    install({ sessionId: 'sess-1' })
    const mcp = setup()
    await until(() => mcp.state.value === 'ready')
    scope!.stop()
    scope = undefined
    await vi.waitFor(() => expect(calls.some(c => c.method === 'DELETE')).toBe(true))
  })

  it('does not touch window or storage during setup when window is undefined', () => {
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const open = vi.fn()
    vi.stubGlobal('open', open)
    vi.stubGlobal('window', undefined)
    const mcp = setup()
    expect(mcp.state.value).toBe('idle')
    expect(fetchFn).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })
})
