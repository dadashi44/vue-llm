import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { useMCPServers, type UseMCPServersOptions, type UseMCPServersReturn } from '../../src/composables/use-mcp-servers.js'
import { MCPUnsupportedServerError } from '../../src/mcp/errors.js'
import { mcpServers } from '../../src/mcp/servers.js'
import { AUTH_URL, fakeBackend, sendCallback, stubPopup } from './mcp-backend.js'

const KEY = 'vue-llm:mcp:'
const A = 'https://mcp.alpha.dev/mcp'
const B = 'https://mcp.beta.dev/mcp'
const CATALOG = [
  { id: 'alpha', url: A, name: 'Alpha' },
  { id: 'beta', url: B },
]

interface Call {
  url: string
  method: string
}

let calls: Call[]
let scope: EffectScope | undefined

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) } })

/** Every URL is an MCP server without auth that has the tools `search` and `fetch` */
function install() {
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method })
    if (method === 'DELETE') return new Response(null, { status: 200 })
    if (method !== 'POST') return new Response('not found', { status: 404 })
    const body = JSON.parse(String(init!.body)) as { id?: number; method: string }
    const reply = (result: unknown) => json({ jsonrpc: '2.0', id: body.id, result }, { headers: { 'Mcp-Session-Id': 's1' } })
    switch (body.method) {
      case 'initialize':
        return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'srv', version: '1' } })
      case 'notifications/initialized':
        return new Response(null, { status: 202 })
      case 'tools/list':
        return reply({
          tools: [
            { name: 'search', inputSchema: { type: 'object' } },
            { name: 'fetch', inputSchema: { type: 'object' } },
          ],
        })
    }
    return new Response('unexpected', { status: 500 })
  })
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

function setup(options: Partial<UseMCPServersOptions> = {}): UseMCPServersReturn {
  scope?.stop()
  scope = effectScope()
  return scope.run(() => useMCPServers({ catalog: CATALOG, ...options }))!
}

const until = (check: () => boolean) => vi.waitFor(() => expect(check()).toBe(true), { timeout: 2000, interval: 5 })
const item = (s: UseMCPServersReturn, id: string) => s.list.value.find(i => i.id === id)!
const persisted = () => JSON.parse(localStorage.getItem(`${KEY}servers`) ?? 'null') as unknown

beforeEach(() => {
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

describe('mcpServers', () => {
  it('has the verified presets with their modes', () => {
    expect(mcpServers.notion).toEqual({ id: 'notion', name: 'Notion', url: 'https://mcp.notion.com/mcp', modes: ['browser', 'server'] })
    expect(mcpServers.linear.url).toBe('https://mcp.linear.app/mcp')
    expect(mcpServers.huggingface.url).toBe('https://huggingface.co/mcp')
    expect(mcpServers.deepwiki.url).toBe('https://mcp.deepwiki.com/mcp')
    expect(mcpServers.github).toMatchObject({ url: 'https://api.githubcopilot.com/mcp/', modes: ['server'] })
    expect(mcpServers.github.oauth).toBeUndefined()
  })
})

describe('useMCPServers', () => {
  it('lists catalog entries disabled by default', () => {
    install()
    const s = setup()
    expect(s.list.value.map(i => [i.id, i.name, i.url, i.custom, i.enabled, i.state])).toEqual([
      ['alpha', 'Alpha', A, false, false, 'idle'],
      ['beta', 'beta', B, false, false, 'idle'],
    ])
    expect(calls).toEqual([])
  })

  it('tools merges ready servers with id prefixes', async () => {
    install()
    const s = setup()
    s.enable('alpha')
    s.enable('beta')
    await until(() => s.list.value.every(i => i.state === 'ready'))
    expect(item(s, 'alpha').tools.map(t => t.name)).toEqual(['alpha_search', 'alpha_fetch'])
    expect(s.tools.value.map(t => t.name)).toEqual(['alpha_search', 'alpha_fetch', 'beta_search', 'beta_fetch'])
  })

  it('a server-only preset shows as unsupported in browser mode', () => {
    const fetchFn = install()
    const s = setup({ catalog: [mcpServers.github] })
    s.enable('github')
    const github = item(s, 'github')
    expect(github.state).toBe('failed')
    expect(github.error).toBeInstanceOf(MCPUnsupportedServerError)
    expect((github.error as MCPUnsupportedServerError).reason).toBe('cors')
    expect(github.error!.message).toBe('GitHub works only in server mode: connect it through createMCPConnector')
    expect(github.tools).toEqual([])
    expect(s.tools.value).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('add() derives a unique id from the host', async () => {
    install()
    const s = setup({ allowCustom: true })
    expect(s.add({ url: 'https://mcp.example.com/mcp' })).toBe('example')
    expect(s.add({ url: 'https://mcp.example.com/other', name: 'Second' })).toBe('example-2')
    expect(s.add({ url: 'https://api.foo.io/mcp' })).toBe('api')
    expect(s.add({ url: 'https://mcp.alpha.dev/x' })).toBe('alpha-2')
    const first = item(s, 'example')
    expect(first).toMatchObject({ custom: true, enabled: true, name: 'mcp.example.com', url: 'https://mcp.example.com/mcp' })
    expect(item(s, 'example-2').name).toBe('Second')
    await until(() => item(s, 'example').state === 'ready')
    expect(s.tools.value.map(t => t.name)).toContain('example_search')
  })

  it('add() reports invalid URLs on the entry', () => {
    install()
    const s = setup({ allowCustom: true })
    let id = ''
    expect(() => (id = s.add({ url: 'http://x' }))).not.toThrow()
    expect(item(s, id)).toMatchObject({ custom: true, state: 'failed', tools: [] })
    expect(item(s, id).error).toBeInstanceOf(Error)
    expect(item(s, id).error!.message).toMatch(/https/)

    const bad = s.add({ url: 'not a url' })
    expect(item(s, bad).state).toBe('failed')
    expect(item(s, bad).error!.message).toMatch(/not a valid URL/)

    const ok = s.add({ url: ' https://a.b ' })
    expect(ok).toBe('a')
    expect(item(s, ok)).toMatchObject({ url: 'https://a.b', enabled: true })
    expect(item(s, ok).state).not.toBe('failed')

    const local = s.add({ url: 'http://localhost:3000/mcp' })
    expect(item(s, local).state).not.toBe('failed')
  })

  it('allowCustom false makes add throw', () => {
    install()
    const s = setup()
    expect(() => s.add({ url: 'https://mcp.example.com/mcp' })).toThrow(/allowCustom/)
    expect(s.list.value).toHaveLength(2)
  })

  it('enabled and custom servers persist and restore', async () => {
    install()
    const s = setup({ allowCustom: true })
    s.enable('beta')
    const id = s.add({ url: 'https://mcp.example.com/mcp', name: 'Ex' })
    expect(persisted()).toEqual({
      enabled: ['beta', 'example'],
      custom: [{ id: 'example', url: 'https://mcp.example.com/mcp', name: 'Ex' }],
    })
    s.disable(id)
    expect(persisted()).toEqual({ enabled: ['beta'], custom: [{ id: 'example', url: 'https://mcp.example.com/mcp', name: 'Ex' }] })
    s.enable(id)

    const restored = setup({ allowCustom: true })
    expect(restored.list.value.map(i => [i.id, i.custom, i.enabled])).toEqual([
      ['alpha', false, false],
      ['beta', false, true],
      ['example', true, true],
    ])
    expect(item(restored, 'example').name).toBe('Ex')
    await until(() => item(restored, 'beta').state === 'ready' && item(restored, 'example').state === 'ready')
  })

  it('ignores corrupt persisted state', () => {
    install()
    localStorage.setItem(`${KEY}servers`, '{not json')
    const s = setup({ allowCustom: true })
    expect(s.list.value.map(i => i.enabled)).toEqual([false, false])
  })

  it('remove() logs out and forgets a custom server', async () => {
    install()
    const s = setup({ allowCustom: true })
    const id = s.add({ url: 'https://mcp.example.com/mcp' })
    await until(() => item(s, id).state === 'ready')
    localStorage.setItem(`${KEY}tokens:https://mcp.example.com/mcp`, JSON.stringify({ access_token: 't', token_type: 'Bearer' }))
    await s.remove(id)
    expect(s.list.value.some(i => i.id === id)).toBe(false)
    expect(localStorage.getItem(`${KEY}tokens:https://mcp.example.com/mcp`)).toBeNull()
    expect(persisted()).toEqual({ enabled: [], custom: [] })
    expect(() => s.remove('alpha')).toThrow()
  })

  it('disable keeps credentials', async () => {
    install()
    const tokensKey = `${KEY}tokens:${A}`
    localStorage.setItem(tokensKey, JSON.stringify({ access_token: 't', token_type: 'Bearer', expires_at: Date.now() + 3600_000 }))
    const s = setup()
    s.enable('alpha')
    await until(() => item(s, 'alpha').state === 'ready')
    s.disable('alpha')
    expect(item(s, 'alpha')).toMatchObject({ enabled: false, state: 'idle', tools: [] })
    expect(s.tools.value).toEqual([])
    expect(localStorage.getItem(tokensKey)).not.toBeNull()
    s.enable('alpha')
    await until(() => item(s, 'alpha').state === 'ready')
  })

  it('authorize opens the popup synchronously', () => {
    install()
    const open = vi.fn(() => null)
    vi.stubGlobal('open', open)
    const s = setup()
    void s.authorize('alpha')
    expect(open).toHaveBeenCalledTimes(1)
    expect(item(s, 'alpha').enabled).toBe(true)
  })

  it('refresh reconnects enabled servers', async () => {
    install()
    const s = setup()
    s.enable('alpha')
    await until(() => item(s, 'alpha').state === 'ready')
    const before = calls.length
    await s.refresh()
    expect(item(s, 'alpha').state).toBe('ready')
    expect(calls.slice(before).every(c => c.url === A)).toBe(true)
    expect(calls.length).toBeGreaterThan(before)
  })

  it('does not touch window or storage during setup when window is undefined', () => {
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    vi.stubGlobal('window', undefined)
    const s = setup({ allowCustom: true })
    expect(s.list.value).toHaveLength(2)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })
})

describe('useMCPServers server mode', () => {
  function serverSetup(options: Partial<UseMCPServersOptions> = {}) {
    const events: string[] = []
    const backend = fakeBackend(events)
    const s = setup({ catalog: undefined, server: '/api/mcp', fetch: backend.fetchFn as unknown as typeof fetch, ...options })
    return { s, backend, events }
  }

  it('server mode lists from GET /servers', async () => {
    const globalFetch = vi.fn()
    vi.stubGlobal('fetch', globalFetch)
    const { s, backend } = serverSetup()
    await until(() => s.list.value.length === 4)
    expect(backend.world.requests[0]).toMatchObject({ url: '/api/mcp/servers', method: 'GET' })
    expect(s.list.value.map(i => [i.id, i.name, i.url, i.custom, i.enabled, i.state])).toEqual([
      ['notion', 'Notion', 'https://mcp.notion.com/mcp', false, false, 'idle'],
      ['gh', 'GitHub', 'https://gh.test/mcp', false, true, 'ready'],
      ['bad', 'Bad', 'https://bad.test/mcp', false, true, 'failed'],
      ['bo', 'Browser only', 'https://bo.test/mcp', false, false, 'failed'],
    ])
    expect(item(s, 'bad').error).toBeInstanceOf(Error)
    expect(item(s, 'bad').error!.message).toBe('Timed out connecting to bad.test')
    expect(item(s, 'bo').error!.message).toBe('Browser only works only in browser mode')
    expect(item(s, 'gh').error).toBeUndefined()
    expect(globalFetch).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)

    backend.find('notion')!.enabled = true
    await s.refresh()
    expect(item(s, 'notion').state).toBe('needs-auth')
  })

  it('shows the frontend catalog until the backend answers', async () => {
    const { s } = serverSetup({ catalog: [mcpServers.notion] })
    expect(s.list.value.map(i => [i.id, i.enabled, i.state])).toEqual([['notion', false, 'idle']])
    await until(() => s.list.value.length === 4)
  })

  it('tools is always [] in server mode', async () => {
    const { s } = serverSetup()
    await until(() => item(s, 'gh')?.state === 'ready')
    expect(item(s, 'gh').tools).toEqual([])
    expect(s.tools.value).toEqual([])
  })

  it('authorize opens about:blank first, POSTs /authorize, then navigates the popup', async () => {
    const { s, backend, events } = serverSetup()
    await until(() => s.list.value.length === 4)
    const { open, popup } = stubPopup(events)
    events.length = 0
    const done = s.authorize('notion')
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toBe('about:blank')
    expect(events[0]).toBe('open')
    await until(() => popup.location.href === AUTH_URL)
    expect(events.slice(0, 2)).toEqual(['open', 'POST /servers/notion/authorize'])
    expect(item(s, 'notion')).toMatchObject({ enabled: true, state: 'authorizing', authUrl: AUTH_URL })

    backend.find('notion')!.state = 'connected'
    sendCallback({ id: 'other', ok: true })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(item(s, 'notion').state).toBe('authorizing')
    const gets = backend.gets()
    sendCallback({ id: 'notion', ok: true })
    await done
    expect(backend.gets()).toBeGreaterThan(gets)
    expect(item(s, 'notion')).toMatchObject({ enabled: true, state: 'ready', authUrl: undefined })
  })

  it('authorize of an already connected server closes the popup and refreshes', async () => {
    const { s, backend, events } = serverSetup()
    await until(() => s.list.value.length === 4)
    const { popup } = stubPopup(events)
    backend.world.authorizeUrl = null
    const gets = backend.gets()
    await s.authorize('gh')
    expect(popup.closed).toBe(true)
    expect(popup.location.href).toBe('about:blank')
    expect(backend.gets()).toBeGreaterThan(gets)
    expect(item(s, 'gh').state).toBe('ready')
  })

  it('refetches after the popup closes and on window focus', async () => {
    const { s, backend, events } = serverSetup()
    await until(() => s.list.value.length === 4)
    const { popup } = stubPopup(events)
    const done = s.authorize('notion')
    await until(() => popup.location.href === AUTH_URL)
    const gets = backend.gets()
    // The user signed in, but the message never arrived (e.g. a cross-origin backend)
    backend.find('notion')!.state = 'connected'
    popup.closed = true
    await done
    expect(backend.gets()).toBe(gets + 1)
    expect(item(s, 'notion').state).toBe('ready')

    backend.find('gh')!.state = 'needs-auth'
    window.dispatchEvent(new Event('focus'))
    await until(() => item(s, 'gh').state === 'needs-auth')
    expect(backend.gets()).toBe(gets + 2)

    scope!.stop()
    window.dispatchEvent(new Event('focus'))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(backend.gets()).toBe(gets + 2)
  }, 10_000)

  it('sends custom headers and credentials', async () => {
    const token = ref('t1')
    const { s, backend } = serverSetup({ headers: () => ({ Authorization: `Bearer ${token.value}` }) })
    await until(() => s.list.value.length === 4)
    token.value = 't2'
    s.enable('notion')
    await until(() => backend.world.requests.length === 2)
    for (const r of backend.world.requests) {
      expect(r.credentials).toBe('include')
      expect(r.headers.get('Content-Type')).toBe('application/json')
    }
    expect(backend.world.requests.map(r => r.headers.get('Authorization'))).toEqual(['Bearer t1', 'Bearer t2'])

    const other = serverSetup({ credentials: 'same-origin', headers: ref({ 'X-Csrf': 'abc' }) })
    await until(() => other.backend.world.requests.length === 1)
    expect(other.backend.world.requests[0].credentials).toBe('same-origin')
    expect(other.backend.world.requests[0].headers.get('X-Csrf')).toBe('abc')
  })

  it('enable, disable, add and remove map to the routes', async () => {
    const { s, backend, events } = serverSetup()
    await until(() => s.list.value.length === 4)
    events.length = 0
    s.enable('notion')
    expect(item(s, 'notion').enabled).toBe(true)
    await until(() => backend.find('notion')!.enabled)
    await s.disable('gh')
    expect(item(s, 'gh')).toMatchObject({ enabled: false, state: 'idle' })

    const id = s.add({ url: 'https://mcp.example.com/mcp', name: 'Ex' })
    expect(id).toBe('example')
    expect(item(s, 'example')).toMatchObject({ custom: true, enabled: true, name: 'Ex' })
    await until(() => item(s, 'example').state === 'needs-auth')
    const post = backend.world.requests.find(r => r.method === 'POST' && r.url === '/api/mcp/servers')!
    expect(JSON.parse(post.body!)).toEqual({ url: 'https://mcp.example.com/mcp', name: 'Ex' })

    const bad = s.add({ url: 'not a url' })
    expect(item(s, bad).state).toBe('failed')

    await s.remove('example')
    expect(s.list.value.some(i => i.id === 'example')).toBe(false)
    expect(() => s.remove('gh')).toThrow(/catalog/)
    expect(events).toEqual([
      'POST /servers/notion/enable',
      'POST /servers/gh/disable',
      'POST /servers',
      'DELETE /servers/example',
    ])
  })

  it('shows a failed request on the entry', async () => {
    const { s, backend } = serverSetup()
    await until(() => s.list.value.length === 4)
    backend.fetchFn.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403 }))
    s.enable('notion')
    await until(() => item(s, 'notion').state === 'failed')
    expect(item(s, 'notion').error!.message).toBe('Origin not allowed')
  })

  it('authorize opens no popup for a server the backend cannot use', async () => {
    const { s, backend } = serverSetup()
    await until(() => s.list.value.length === 4)
    const { open } = stubPopup()
    await s.authorize('bo')
    expect(open).not.toHaveBeenCalled()
    expect(backend.world.requests.filter(r => r.method === 'POST')).toEqual([])
  })

  it('does not fetch during setup when window is undefined', () => {
    const backend = fakeBackend()
    vi.stubGlobal('window', undefined)
    const s = setup({ server: '/api/mcp', fetch: backend.fetchFn as unknown as typeof fetch })
    expect(s.list.value).toHaveLength(2)
    expect(backend.fetchFn).not.toHaveBeenCalled()
  })
})
