import { describe, expect, it, vi } from 'vitest'
import { createMCPClient } from '../../src/mcp/client.js'
import { MCPAuthError, MCPHTTPError, MCPProtocolError, MCPUnsupportedServerError } from '../../src/mcp/errors.js'
import type { MCPAuth } from '../../src/mcp/auth.js'
import { mcpTools } from '../../src/mcp/tools.js'

const URL_ = 'https://mcp.example.com/mcp'

interface Call {
  method: string
  headers: Headers
  body: { id?: number; method?: string; params?: Record<string, unknown> } | undefined
  signal?: AbortSignal | null
}

type Handler = (call: Call) => Response | Promise<Response>

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  })

const sse = (messages: unknown[], init: ResponseInit = {}) =>
  new Response(messages.map(m => `event: message\ndata: ${JSON.stringify(m)}\n\n`).join(''), {
    ...init,
    headers: { 'Content-Type': 'text/event-stream', ...(init.headers as Record<string, string> | undefined) },
  })

const result = (id: number | undefined, value: unknown) => ({ jsonrpc: '2.0', id, result: value })

const initResult = {
  protocolVersion: '2025-06-18',
  capabilities: { tools: {} },
  serverInfo: { name: 'test-server', version: '1.2.3' },
}

/** A fake MCP endpoint: handlers by JSON-RPC method (or HTTP method for DELETE) */
function server(handlers: Record<string, Handler>, sessionId?: string) {
  const calls: Call[] = []
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe(URL_)
    const body = init?.body ? JSON.parse(String(init.body)) as Call['body'] : undefined
    const call: Call = { method: init?.method ?? 'GET', headers: new Headers(init?.headers), body, signal: init?.signal }
    calls.push(call)
    const key = call.method === 'DELETE' ? 'DELETE' : body?.method ?? ''
    const handler = handlers[key]
    if (handler) return handler(call)
    if (key === 'initialize') {
      return json(result(body!.id, initResult), { headers: sessionId ? { 'Mcp-Session-Id': sessionId } : {} })
    }
    if (key === 'notifications/initialized') return new Response(null, { status: 202 })
    if (key === 'tools/list') return json(result(body!.id, { tools: [] }))
    return new Response('unexpected', { status: 500 })
  })
  return { fetch: fetchFn as unknown as typeof fetch, calls }
}

function fakeAuth(token: string | undefined, decision: 'retry' | 'needs-auth' = 'retry'): MCPAuth & { onUnauthorized: ReturnType<typeof vi.fn> } {
  return {
    accessToken: vi.fn(async () => token),
    onUnauthorized: vi.fn(async () => decision),
    startAuthorization: vi.fn(),
    finishAuthorization: vi.fn(),
    logout: vi.fn(),
  } as never
}

const unauthorized = () => new Response('no', {
  status: 401,
  headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp", scope="read write"' },
})

describe('createMCPClient', () => {
  it('sends initialize with protocolVersion 2025-06-18 then notifications/initialized', async () => {
    const s = server({})
    const client = createMCPClient({ url: URL_, fetch: s.fetch, clientInfo: { name: 'app', version: '0.1.0' } })

    const res = await client.connect()

    expect(res).toEqual({ status: 'ready', serverInfo: { name: 'test-server', version: '1.2.3' }, protocolVersion: '2025-06-18' })
    expect(s.calls.map(c => c.body?.method)).toEqual(['initialize', 'notifications/initialized'])
    expect(s.calls[0].method).toBe('POST')
    expect(s.calls[0].body).toMatchObject({
      jsonrpc: '2.0',
      id: expect.any(Number),
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'app', version: '0.1.0' } },
    })
    expect(s.calls[0].headers.get('Content-Type')).toBe('application/json')
    expect(s.calls[0].headers.get('Accept')).toContain('application/json')
    expect(s.calls[0].headers.get('Accept')).toContain('text/event-stream')
    expect(s.calls[1].body).not.toHaveProperty('id')
  })

  it('sends Mcp-Session-Id and MCP-Protocol-Version on later requests', async () => {
    const s = server({}, 'sess-1')
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()
    await client.listTools()

    expect(s.calls[0].headers.has('Mcp-Session-Id')).toBe(false)
    expect(s.calls[0].headers.has('MCP-Protocol-Version')).toBe(false)
    for (const call of s.calls.slice(1)) {
      expect(call.headers.get('Mcp-Session-Id')).toBe('sess-1')
      expect(call.headers.get('MCP-Protocol-Version')).toBe('2025-06-18')
    }
  })

  it('treats a missing session id as stateless', async () => {
    const s = server({})
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()
    await client.listTools()

    expect(s.calls[2].headers.has('Mcp-Session-Id')).toBe(false)
    expect(s.calls[2].headers.get('MCP-Protocol-Version')).toBe('2025-06-18')
  })

  it('parses application/json and text/event-stream responses', async () => {
    const tool = { name: 'a', inputSchema: { type: 'object' } }
    const s = server({
      'initialize': c => sse([result(c.body!.id, initResult)]),
      'tools/list': c => json(result(c.body!.id, { tools: [tool] })),
      'tools/call': c => sse([result(c.body!.id, { content: [{ type: 'text', text: 'hi' }] })]),
    })
    const client = createMCPClient({ url: URL_, fetch: s.fetch })

    await expect(client.connect()).resolves.toMatchObject({ status: 'ready' })
    await expect(client.listTools()).resolves.toEqual({ tools: [tool] })
    await expect(client.callTool({ name: 'a', arguments: {} })).resolves.toEqual({ content: [{ type: 'text', text: 'hi' }] })
    expect(s.calls.at(-1)!.body).toMatchObject({ method: 'tools/call', params: { name: 'a', arguments: {} } })
  })

  it('picks the response with the matching id from an SSE stream', async () => {
    const s = server({
      'tools/call': c => sse([
        { jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1, progressToken: 't' } },
        result(9999, { content: [{ type: 'text', text: 'other' }] }),
        result(c.body!.id, { content: [{ type: 'text', text: 'mine' }] }),
      ]),
    })
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()

    await expect(client.callTool({ name: 'x' })).resolves.toEqual({ content: [{ type: 'text', text: 'mine' }] })
  })

  it('throws MCPProtocolError when an SSE stream ends without the response', async () => {
    const s = server({
      'tools/call': () => sse([{ jsonrpc: '2.0', method: 'notifications/progress', params: {} }]),
    })
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()

    const error = await client.callTool({ name: 'x' }).catch(e => e)
    expect(error).toBeInstanceOf(MCPProtocolError)
    expect(error).toMatchObject({ code: -32000, message: 'No response from the MCP server' })
  })

  it('follows nextCursor in listTools', async () => {
    const s = server({
      'tools/list': (c) => {
        const cursor = c.body!.params?.cursor
        return cursor === 'p2'
          ? json(result(c.body!.id, { tools: [{ name: 'b', inputSchema: {} }] }))
          : json(result(c.body!.id, { tools: [{ name: 'a', inputSchema: {} }], nextCursor: 'p2' }))
      },
    })
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()

    await expect(client.listTools()).resolves.toEqual({ tools: [{ name: 'a', inputSchema: {} }], nextCursor: 'p2' })
    const tools = await mcpTools(client)
    expect(tools.map(t => t.name)).toEqual(['a', 'b'])
    expect(s.calls.filter(c => c.body?.method === 'tools/list').map(c => c.body!.params?.cursor)).toEqual([undefined, undefined, 'p2'])
  })

  it('uses incrementing request ids', async () => {
    const s = server({})
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()
    await client.listTools()
    await client.listTools()

    const ids = s.calls.filter(c => c.body?.id !== undefined).map(c => c.body!.id!)
    expect(ids).toHaveLength(3)
    expect(ids[1]).toBe(ids[0] + 1)
    expect(ids[2]).toBe(ids[1] + 1)
  })

  it('maps a JSON-RPC error to MCPProtocolError', async () => {
    const s = server({
      'tools/call': c => json({ jsonrpc: '2.0', id: c.body!.id, error: { code: -32602, message: 'Unknown tool', data: { name: 'x' } } }),
    })
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()

    const error = await client.callTool({ name: 'x' }).catch(e => e)
    expect(error).toBeInstanceOf(MCPProtocolError)
    expect(error).toMatchObject({ code: -32602, message: 'Unknown tool', data: { name: 'x' } })
  })

  it('maps a non-2xx other than 401 to MCPHTTPError with status and body excerpt', async () => {
    const s = server({ 'tools/list': () => new Response('upstream exploded ' + 'x'.repeat(5000), { status: 502 }) })
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()

    const error = await client.listTools().catch(e => e)
    expect(error).toBeInstanceOf(MCPHTTPError)
    expect(error.status).toBe(502)
    expect(error.body.startsWith('upstream exploded')).toBe(true)
    expect(error.body.length).toBeLessThan(1000)
  })

  it('clears an expired session on 404 and throws MCPHTTPError', async () => {
    let expired = false
    const s = server({ 'tools/list': c => expired ? new Response('gone', { status: 404 }) : json(result(c.body!.id, { tools: [] })) }, 'sess-1')
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()
    expired = true

    const error = await client.listTools().catch(e => e)
    expect(error).toBeInstanceOf(MCPHTTPError)
    expect(error.status).toBe(404)

    await client.connect()
    expect(s.calls.at(-2)!.body?.method).toBe('initialize')
    expect(s.calls.at(-2)!.headers.has('Mcp-Session-Id')).toBe(false)
  })

  it('maps a fetch TypeError to MCPUnsupportedServerError cors', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const client = createMCPClient({ url: URL_, fetch: fetchFn })

    const error = await client.connect().catch(e => e)
    expect(error).toBeInstanceOf(MCPUnsupportedServerError)
    expect(error.reason).toBe('cors')
  })

  it('sends the access token as a Bearer header', async () => {
    const s = server({})
    const client = createMCPClient({ url: URL_, fetch: s.fetch, auth: fakeAuth('tok-1') })
    await client.connect()

    for (const call of s.calls) expect(call.headers.get('Authorization')).toBe('Bearer tok-1')
  })

  it('lets an accessToken rejection propagate', async () => {
    const s = server({})
    const auth = fakeAuth('tok')
    auth.accessToken = vi.fn(async () => {
      throw new MCPHTTPError(503, 'down')
    })
    const client = createMCPClient({ url: URL_, fetch: s.fetch, auth })

    await expect(client.connect()).rejects.toMatchObject({ name: 'MCPHTTPError', status: 503 })
  })

  it('on 401 calls auth.onUnauthorized and retries once on retry', async () => {
    let first = true
    const s = server({
      'tools/list': (c) => {
        if (first) {
          first = false
          return unauthorized()
        }
        return json(result(c.body!.id, { tools: [] }))
      },
    })
    const auth = fakeAuth('tok')
    const client = createMCPClient({ url: URL_, fetch: s.fetch, auth })
    await client.connect()

    await expect(client.listTools()).resolves.toEqual({ tools: [] })
    expect(auth.onUnauthorized).toHaveBeenCalledTimes(1)
    expect(auth.onUnauthorized).toHaveBeenCalledWith({
      resourceMetadata: 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
      scope: 'read write',
    })
    expect(s.calls.filter(c => c.body?.method === 'tools/list')).toHaveLength(2)
  })

  it('throws MCPAuthError after a second 401 or on needs-auth', async () => {
    const s = server({ 'tools/list': () => unauthorized() })
    const auth = fakeAuth('tok')
    const client = createMCPClient({ url: URL_, fetch: s.fetch, auth })
    await client.connect()

    const error = await client.listTools().catch(e => e)
    expect(error).toBeInstanceOf(MCPAuthError)
    expect(error.code).toBe('unauthorized')
    expect(auth.onUnauthorized).toHaveBeenCalledTimes(1)
    expect(s.calls.filter(c => c.body?.method === 'tools/list')).toHaveLength(2)

    const denied = fakeAuth('tok', 'needs-auth')
    const other = createMCPClient({ url: URL_, fetch: s.fetch, auth: denied })
    await other.connect()
    await expect(other.listTools()).rejects.toBeInstanceOf(MCPAuthError)
    expect(s.calls.filter(c => c.body?.method === 'tools/list')).toHaveLength(3)
  })

  it('connect returns needs-auth with the parsed challenge', async () => {
    const s = server({ initialize: () => unauthorized() })
    const auth = fakeAuth(undefined, 'needs-auth')
    const client = createMCPClient({ url: URL_, fetch: s.fetch, auth })

    await expect(client.connect()).resolves.toEqual({
      status: 'needs-auth',
      challenge: { resourceMetadata: 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp', scope: 'read write' },
    })
    expect(auth.onUnauthorized).toHaveBeenCalledTimes(1)
    expect(s.calls[0].headers.has('Authorization')).toBe(false)

    const noAuth = createMCPClient({ url: URL_, fetch: s.fetch })
    await expect(noAuth.connect()).resolves.toMatchObject({ status: 'needs-auth' })
  })

  it('probeAuthorizationHeader sends a placeholder Bearer and accepts any status', async () => {
    const s = server({ initialize: () => unauthorized() })
    const client = createMCPClient({ url: URL_, fetch: s.fetch })

    await expect(client.probeAuthorizationHeader()).resolves.toBeUndefined()
    expect(s.calls[0].headers.get('Authorization')).toBe('Bearer probe')
    expect(s.calls[0].body?.method).toBe('initialize')
  })

  it('probeAuthorizationHeader throws MCPUnsupportedServerError cors when fetch rejects with a placeholder Bearer', async () => {
    const fetchFn = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      if (new Headers(init?.headers).has('Authorization')) throw new TypeError('Failed to fetch')
      return unauthorized()
    }) as unknown as typeof fetch
    const client = createMCPClient({ url: URL_, fetch: fetchFn })

    const error = await client.probeAuthorizationHeader().catch(e => e)
    expect(error).toBeInstanceOf(MCPUnsupportedServerError)
    expect(error.reason).toBe('cors')
    expect(error.message).toMatch(/browser/)
    expect(error.message).toMatch(/server mode/)
  })

  it('close sends DELETE with the session id', async () => {
    const s = server({ DELETE: () => new Response(null, { status: 200 }) }, 'sess-1')
    const client = createMCPClient({ url: URL_, fetch: s.fetch, auth: fakeAuth('tok') })
    await client.connect()
    await client.close()

    const del = s.calls.at(-1)!
    expect(del.method).toBe('DELETE')
    expect(del.headers.get('Mcp-Session-Id')).toBe('sess-1')
    expect(del.headers.get('Authorization')).toBe('Bearer tok')

    await client.close()
    expect(s.calls.filter(c => c.method === 'DELETE')).toHaveLength(1)
  })

  it('close without a session sends nothing', async () => {
    const s = server({})
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()
    await client.close()

    expect(s.calls.some(c => c.method === 'DELETE')).toBe(false)
  })

  it('passes the AbortSignal to fetch', async () => {
    const s = server({})
    const client = createMCPClient({ url: URL_, fetch: s.fetch })
    await client.connect()
    const controller = new AbortController()

    await client.listTools(undefined, { signal: controller.signal })
    await client.callTool({ name: 'x' }, undefined, { signal: controller.signal }).catch(() => {})

    const later = s.calls.slice(2)
    expect(later).toHaveLength(2)
    for (const call of later) expect(call.signal).toBe(controller.signal)
  })
})
