import { vi } from 'vitest'

/** A fake `createMCPConnector` under `/api/mcp`, for the server-mode composable specs */

export const AUTH_STATE = 's'
export const AUTH_URL = `https://auth.test/authorize?client_id=c&state=${AUTH_STATE}`

export interface FakeEntry {
  id: string
  name: string
  url: string
  custom: boolean
  enabled: boolean
  state: 'connected' | 'needs-auth' | 'unsupported' | 'error'
  error?: string
}

export interface BackendRequest {
  url: string
  method: string
  headers: Headers
  credentials?: RequestCredentials
  body?: string
}

export function fakeBackend(events: string[] = []) {
  const servers: FakeEntry[] = [
    { id: 'notion', name: 'Notion', url: 'https://mcp.notion.com/mcp', custom: false, enabled: false, state: 'needs-auth' },
    { id: 'gh', name: 'GitHub', url: 'https://gh.test/mcp', custom: false, enabled: true, state: 'connected' },
    { id: 'bad', name: 'Bad', url: 'https://bad.test/mcp', custom: false, enabled: true, state: 'error', error: 'Timed out connecting to bad.test' },
    { id: 'bo', name: 'Browser only', url: 'https://bo.test/mcp', custom: false, enabled: false, state: 'unsupported', error: 'Browser only works only in browser mode' },
  ]
  const world = {
    servers,
    authorizeUrl: AUTH_URL as string | null,
    requests: [] as BackendRequest[],
    /** POST /servers answers 409 with this id, as the connector does for a URL it already has */
    duplicateOf: undefined as string | undefined,
    /** Bodies of POST /servers/:id/complete */
    completes: [] as { id: string; body: Record<string, unknown> }[],
  }
  const find = (id: string) => servers.find(s => s.id === id)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? init.body : undefined
    world.requests.push({ url, method, headers: new Headers(init?.headers), credentials: init?.credentials, body })
    const path = url.replace(/^\/api\/mcp/, '')
    events.push(`${method} ${path}`)
    if (path === '/servers' && method === 'GET') return json({ servers })
    if (path === '/servers' && method === 'POST') {
      if (world.duplicateOf) return json({ error: 'This server is already in the list', id: world.duplicateOf, servers }, 409)
      const data = JSON.parse(body!) as { url: string; name?: string }
      const id = new URL(data.url).hostname.split('.')[1]
      servers.push({ id, name: data.name ?? new URL(data.url).host, url: data.url, custom: true, enabled: true, state: 'needs-auth' })
      return json({ id, servers }, 201)
    }
    let m = /^\/servers\/([^/]+)$/.exec(path)
    if (m && method === 'DELETE') {
      const index = servers.findIndex(s => s.id === decodeURIComponent(m![1]))
      if (index < 0 || !servers[index].custom) return json({ error: 'nope' }, 400)
      servers.splice(index, 1)
      return json({ servers })
    }
    m = /^\/servers\/([^/]+)\/(enable|disable|authorize|complete|logout)$/.exec(path)
    const s = m && find(decodeURIComponent(m[1]))
    if (m && s && method === 'POST') {
      if (m[2] === 'authorize') {
        s.enabled = true
        return json(world.authorizeUrl === null ? { url: null } : { url: world.authorizeUrl, state: AUTH_STATE })
      }
      if (m[2] === 'complete') {
        const data = JSON.parse(body!) as Record<string, unknown>
        world.completes.push({ id: s.id, body: data })
        if (data.state !== AUTH_STATE) return json({ error: 'This sign-in expired or was already used; try again' }, 400)
        s.state = data.code ? 'connected' : 'needs-auth'
        return json({ servers })
      }
      if (m[2] === 'enable') s.enabled = true
      if (m[2] === 'disable') s.enabled = false
      if (m[2] === 'logout') s.state = 'needs-auth'
      return json({ servers })
    }
    return json({ error: 'Not found' }, 404)
  })

  return { world, fetchFn, find, gets: () => world.requests.filter(r => r.method === 'GET').length }
}

export interface FakePopup {
  closed: boolean
  location: { href: string }
  close: () => void
}

export function stubPopup(events: string[] = []): { open: ReturnType<typeof vi.fn>; popup: FakePopup } {
  const popup: FakePopup = {
    closed: false,
    location: { href: 'about:blank' },
    close() {
      this.closed = true
    },
  }
  const open = vi.fn(() => {
    events.push('open')
    return popup
  })
  vi.stubGlobal('open', open)
  return { open, popup }
}

export function sendCallback(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'vue-llm:mcp-callback', ...data }, origin: location.origin }))
}
