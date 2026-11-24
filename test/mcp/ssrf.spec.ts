// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { MCPUnsupportedServerError } from '../../src/mcp/errors.js'
import { assertPublicHost, guardedFetch, loadNodeResolver } from '../../src/mcp/ssrf.js'

const PUBLIC = '93.184.216.34'
const publicResolve = async () => [PUBLIC]

describe('assertPublicHost', () => {
  it('rejects 127.0.0.1, 10.x, 172.16.x, 192.168.x, 169.254.169.254, [::1], fc00::/7, localhost', async () => {
    const blocked = [
      'https://127.0.0.1/mcp',
      'https://127.8.9.10/',
      'https://10.1.2.3/',
      'https://172.16.5.4/',
      'https://172.31.255.255/',
      'https://192.168.1.1/',
      'https://169.254.169.254/latest/meta-data',
      'https://0.0.0.0/',
      'https://100.64.0.1/',
      'https://2130706433/', // 127.0.0.1 in decimal
      'https://[::1]/',
      'https://[::]/',
      'https://[fc00::1]/',
      'https://[fd12:3456::1]/',
      'https://[fe80::1]/',
      'https://[::ffff:127.0.0.1]/',
      'https://[::ffff:a9fe:a9fe]/',
      'https://localhost/',
      'https://LOCALHOST./',
      'https://api.localhost/',
      'https://metadata.google.internal/',
      'http://example.com/mcp',
    ]
    for (const url of blocked) {
      await expect(assertPublicHost(new URL(url), { resolve: publicResolve }), url).rejects.toBeInstanceOf(MCPUnsupportedServerError)
    }
    await expect(assertPublicHost(new URL('https://127.0.0.1/'), {})).rejects.toThrow(/127\.0\.0\.1/)
  })

  it('allows public hosts and addresses', async () => {
    for (const url of ['https://8.8.8.8/', 'https://172.32.0.1/', 'https://[2606:4700::1111]/', 'https://mcp.example.com/mcp']) {
      await expect(assertPublicHost(new URL(url), { resolve: publicResolve }), url).resolves.toBeUndefined()
    }
    // Without a resolver only the literal checks apply
    await expect(assertPublicHost(new URL('https://mcp.example.com/mcp'), {})).resolves.toBeUndefined()
  })

  it('allowHosts restricts to matching patterns', async () => {
    const o = { allowHosts: ['*.example.com', 'mcp.other.dev'] }
    await expect(assertPublicHost(new URL('https://a.example.com/mcp'), o)).resolves.toBeUndefined()
    await expect(assertPublicHost(new URL('https://A.B.Example.com/mcp'), o)).resolves.toBeUndefined()
    await expect(assertPublicHost(new URL('https://mcp.other.dev/mcp'), o)).resolves.toBeUndefined()
    await expect(assertPublicHost(new URL('https://example.com/mcp'), o)).rejects.toThrow(/not an allowed MCP host/)
    await expect(assertPublicHost(new URL('https://evil.com/mcp'), o)).rejects.toBeInstanceOf(MCPUnsupportedServerError)
    await expect(assertPublicHost(new URL('https://example.com.evil.com/mcp'), o)).rejects.toBeInstanceOf(MCPUnsupportedServerError)
    // Literal private addresses stay blocked even when a pattern would match
    await expect(assertPublicHost(new URL('https://10.0.0.1/'), { allowHosts: ['10.0.0.1'] })).rejects.toBeInstanceOf(MCPUnsupportedServerError)
  })

  it('rejects a host resolving to a private address when a resolver exists', async () => {
    const resolve = vi.fn(async (host: string) => (host === 'internal.example.com' ? [PUBLIC, '10.0.0.7'] : host === 'v6.example.com' ? ['::1'] : [PUBLIC]))
    await expect(assertPublicHost(new URL('https://internal.example.com/'), { resolve })).rejects.toThrow(/private/)
    await expect(assertPublicHost(new URL('https://v6.example.com/'), { resolve })).rejects.toBeInstanceOf(MCPUnsupportedServerError)
    await expect(assertPublicHost(new URL('https://public.example.com/'), { resolve })).resolves.toBeUndefined()
    expect(resolve).toHaveBeenCalledWith('internal.example.com')
    // A literal IP is not looked up
    resolve.mockClear()
    await assertPublicHost(new URL('https://8.8.8.8/'), { resolve })
    expect(resolve).not.toHaveBeenCalled()
  })
})

describe('guardedFetch', () => {
  it('rejects a redirect hop to a private address', async () => {
    const base = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://169.254.169.254/latest' } }))
    const guarded = guardedFetch(base as unknown as typeof fetch, { resolve: publicResolve })
    await expect(guarded('https://mcp.example.com/mcp')).rejects.toBeInstanceOf(MCPUnsupportedServerError)
    expect(base).toHaveBeenCalledTimes(1)
    expect((base.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: 'manual' })
  })

  it('never calls fetch for a blocked first hop', async () => {
    const base = vi.fn(async () => new Response('ok'))
    await expect(guardedFetch(base as unknown as typeof fetch, {})('https://10.0.0.1/mcp')).rejects.toBeInstanceOf(MCPUnsupportedServerError)
    expect(base).not.toHaveBeenCalled()
  })

  it('follows allowed redirects, re-checking each hop', async () => {
    const hops: { url: string; method?: string; body?: unknown; auth?: string | null }[] = []
    const base = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      hops.push({ url, method: init?.method, body: init?.body, auth: new Headers(init?.headers).get('Authorization') })
      if (url === 'https://a.example.com/x') return new Response(null, { status: 307, headers: { Location: '/y' } })
      if (url === 'https://a.example.com/y') return new Response(null, { status: 303, headers: { Location: 'https://b.example.com/z' } })
      return new Response('done')
    })
    const resolve = vi.fn(async (_host: string) => [PUBLIC])
    const guarded = guardedFetch(base as unknown as typeof fetch, { resolve })
    const response = await guarded('https://a.example.com/x', { method: 'POST', body: 'payload', headers: { Authorization: 'Bearer t' } })
    expect(await response.text()).toBe('done')
    expect(hops).toEqual([
      { url: 'https://a.example.com/x', method: 'POST', body: 'payload', auth: 'Bearer t' },
      { url: 'https://a.example.com/y', method: 'POST', body: 'payload', auth: 'Bearer t' },
      { url: 'https://b.example.com/z', method: 'GET', body: undefined, auth: null },
    ])
    expect(resolve.mock.calls.map(c => c[0])).toEqual(['a.example.com', 'a.example.com', 'b.example.com'])
  })

  it('trusted hosts skip the checks but their redirects are re-checked', async () => {
    const base = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith('http://localhost:4000')
        ? new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1:9000/admin' } })
        : new Response('ok'))
    const guarded = guardedFetch(base as unknown as typeof fetch, { trusted: url => url.host === 'localhost:4000' })
    await expect(guarded('http://localhost:4000/mcp')).rejects.toBeInstanceOf(MCPUnsupportedServerError)
    expect(base).toHaveBeenCalledTimes(1)
  })

  it('stops after too many redirects', async () => {
    const base = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://a.example.com/again' } }))
    await expect(guardedFetch(base as unknown as typeof fetch, {})('https://a.example.com/')).rejects.toThrow(/redirect/i)
  })
})

describe('loadNodeResolver', () => {
  it('resolves through node:dns where it exists', async () => {
    const resolve = await loadNodeResolver()
    expect(typeof resolve).toBe('function')
    const addresses = await resolve!('localhost')
    expect(addresses.length).toBeGreaterThan(0)
    expect(addresses.every(a => a === '127.0.0.1' || a === '::1')).toBe(true)
  })
})
