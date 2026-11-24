import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMCPAuth } from '../../src/mcp/auth.js'
import { MCPAuthError, MCPUnsupportedServerError } from '../../src/mcp/errors.js'
import { discoverAuth, parseWWWAuthenticate } from '../../src/mcp/oauth.js'
import { resolveMCPStorage } from '../../src/mcp/storage.js'

const SERVER = 'https://mcp.example.com/mcp'
const ISSUER = 'https://auth.example.com'
const AS_META = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  registration_endpoint: `${ISSUER}/register`,
  code_challenge_methods_supported: ['S256'],
}
const PRM = { resource: SERVER, authorization_servers: [ISSUER], scopes_supported: ['a', 'b'] }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Route = (init?: RequestInit) => Response
function router(routes: Record<string, Route | unknown>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const r = routes[url]
    if (r === undefined) return new Response('nope', { status: 404 })
    return typeof r === 'function' ? (r as Route)(init) : json(r)
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

const baseRoutes = () => ({
  'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': PRM,
  [`${ISSUER}/.well-known/oauth-authorization-server`]: AS_META,
})

function make(routes: Record<string, Route | unknown>, extra: Record<string, unknown> = {}) {
  const r = router(routes)
  const storage = resolveMCPStorage('memory')
  const auth = createMCPAuth({
    serverUrl: SERVER,
    storage,
    keyPrefix: 'p:',
    clientName: 'App',
    redirectUri: 'https://app.test/mcp/callback',
    fetch: r.fetch,
    ...extra,
  })
  return { ...r, storage, auth }
}

const form = (init?: RequestInit) => new URLSearchParams(String(init?.body))

describe('parseWWWAuthenticate', () => {
  it('reads resource_metadata and scope', () => {
    expect(
      parseWWWAuthenticate('Bearer realm="x", resource_metadata="https://a/b", scope="read write"'),
    ).toEqual({ resourceMetadata: 'https://a/b', scope: 'read write' })
    expect(parseWWWAuthenticate(null)).toEqual({})
  })
})

describe('discoverAuth', () => {
  it('discovers via resource_metadata from WWW-Authenticate', async () => {
    const r = router({ 'https://x.test/prm': PRM, [`${ISSUER}/.well-known/oauth-authorization-server`]: AS_META })
    const d = await discoverAuth(SERVER, { resourceMetadata: 'https://x.test/prm' }, r.fetch)
    expect(d.metadata.token_endpoint).toBe(`${ISSUER}/token`)
    expect(r.calls[0].url).toBe('https://x.test/prm')
  })

  it('falls back to /.well-known/oauth-protected-resource{path} then root', async () => {
    const r = router({
      'https://mcp.example.com/.well-known/oauth-protected-resource': PRM,
      [`${ISSUER}/.well-known/oauth-authorization-server`]: AS_META,
    })
    await discoverAuth(SERVER, {}, r.fetch)
    expect(r.calls.slice(0, 2).map((c) => c.url)).toEqual([
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
      'https://mcp.example.com/.well-known/oauth-protected-resource',
    ])
  })

  it('tries authorization-server URLs in order', async () => {
    const issuer = 'https://auth.example.com/tenant'
    const r = router({
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': { ...PRM, authorization_servers: [issuer] },
      'https://auth.example.com/tenant/.well-known/openid-configuration': { ...AS_META, issuer },
    })
    const d = await discoverAuth(SERVER, {}, r.fetch)
    expect(d.metadata.issuer).toBe(issuer)
    expect(r.calls.slice(1).map((c) => c.url)).toEqual([
      'https://auth.example.com/.well-known/oauth-authorization-server/tenant',
      'https://auth.example.com/tenant/.well-known/oauth-authorization-server',
      'https://auth.example.com/.well-known/openid-configuration/tenant',
      'https://auth.example.com/tenant/.well-known/openid-configuration',
    ])
  })

  it('scope: challenge, else scopes_supported, else omitted', async () => {
    const routes = baseRoutes()
    expect((await discoverAuth(SERVER, { scope: 'read' }, router(routes).fetch)).scope).toBe('read')
    expect((await discoverAuth(SERVER, {}, router(routes).fetch)).scope).toBe('a b')
    const noScopes = { ...routes, 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': { ...PRM, scopes_supported: undefined } }
    expect((await discoverAuth(SERVER, {}, router(noScopes).fetch)).scope).toBeUndefined()
  })

  it('resource: metadata resource, else the server URL', async () => {
    const routes = {
      ...baseRoutes(),
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': { ...PRM, resource: `${SERVER}/` },
    }
    expect((await discoverAuth(SERVER, {}, router(routes).fetch)).resource).toBe(`${SERVER}/`)
    const none = { ...baseRoutes(), 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': { ...PRM, resource: undefined } }
    expect((await discoverAuth(SERVER, {}, router(none).fetch)).resource).toBe(SERVER)
  })

  it('rejects metadata whose issuer differs from the discovered one', async () => {
    const r = router({
      ...baseRoutes(),
      [`${ISSUER}/.well-known/oauth-authorization-server`]: { ...AS_META, issuer: 'https://evil.test' },
    })
    await expect(discoverAuth(SERVER, {}, r.fetch)).rejects.toMatchObject({ reason: 'no-auth-metadata' })
  })

  it('rejects a protected resource that is not the server URL, tolerating a trailing slash', async () => {
    const bad = router({
      ...baseRoutes(),
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': { ...PRM, resource: 'https://other.test/mcp' },
    })
    await expect(discoverAuth(SERVER, {}, bad.fetch)).rejects.toMatchObject({ reason: 'no-auth-metadata' })
    const ok = router({
      ...baseRoutes(),
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': { ...PRM, resource: `${SERVER}/` },
    })
    await expect(discoverAuth(SERVER, {}, ok.fetch)).resolves.toBeTruthy()
  })

  it.each(['authorization_endpoint', 'token_endpoint', 'registration_endpoint'])(
    'rejects an unsafe %s',
    async (field) => {
      for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://evil.test/x']) {
        const r = router({
          ...baseRoutes(),
          [`${ISSUER}/.well-known/oauth-authorization-server`]: { ...AS_META, [field]: bad },
        })
        await expect(discoverAuth(SERVER, {}, r.fetch)).rejects.toMatchObject({ reason: 'no-auth-metadata' })
      }
    },
  )

  it('rejects an http authorization server and allows http localhost', async () => {
    const r = router({
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': { ...PRM, authorization_servers: ['http://evil.test'] },
    })
    await expect(discoverAuth(SERVER, {}, r.fetch)).rejects.toMatchObject({ reason: 'no-auth-metadata' })
    const local = 'http://localhost:9000'
    const ok = router({
      'http://localhost:3000/.well-known/oauth-protected-resource': { resource: 'http://localhost:3000', authorization_servers: [local] },
      [`${local}/.well-known/oauth-authorization-server`]: {
        ...AS_META, issuer: local, authorization_endpoint: `${local}/a`, token_endpoint: `${local}/t`, registration_endpoint: `${local}/r`,
      },
    })
    await expect(discoverAuth('http://localhost:3000', {}, ok.fetch)).resolves.toBeTruthy()
  })

  it('rejects an http resource_metadata URL', async () => {
    const r = router({ 'http://evil.test/prm': PRM, ...baseRoutes() })
    await discoverAuth(SERVER, { resourceMetadata: 'http://evil.test/prm' }, r.fetch)
    expect(r.calls.some((c) => c.url === 'http://evil.test/prm')).toBe(false)
  })

  it('throws no-pkce without S256', async () => {
    const r = router({
      ...baseRoutes(),
      [`${ISSUER}/.well-known/oauth-authorization-server`]: { ...AS_META, code_challenge_methods_supported: ['plain'] },
    })
    await expect(discoverAuth(SERVER, {}, r.fetch)).rejects.toMatchObject({ reason: 'no-pkce' })
  })

  it('throws no-auth-metadata when everything 404s', async () => {
    await expect(discoverAuth(SERVER, {}, router({}).fetch)).rejects.toMatchObject({
      reason: 'no-auth-metadata',
    })
  })
})

describe('createMCPAuth', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const tokenRoutes = (extra: Record<string, Route | unknown> = {}) => ({
    ...baseRoutes(),
    [`${ISSUER}/register`]: () => json({ client_id: 'cid' }),
    [`${ISSUER}/token`]: () =>
      json({ access_token: 'at', token_type: 'Bearer', refresh_token: 'rt', expires_in: 3600 }),
    ...extra,
  })

  it('throws no-registration without registration_endpoint and client', async () => {
    const { auth } = make({
      ...baseRoutes(),
      [`${ISSUER}/.well-known/oauth-authorization-server`]: { ...AS_META, registration_endpoint: undefined },
    })
    await expect(auth.onUnauthorized({})).rejects.toBeInstanceOf(MCPUnsupportedServerError)
    await expect(auth.onUnauthorized({})).rejects.toMatchObject({ reason: 'no-registration' })
  })

  it('uses a pre-registered client without registering or storing it', async () => {
    const { auth, calls, storage } = make(
      {
        ...baseRoutes(),
        [`${ISSUER}/.well-known/oauth-authorization-server`]: { ...AS_META, registration_endpoint: undefined },
      },
      { client: { client_id: 'gh', client_secret: 's' } },
    )
    const { url } = await auth.startAuthorization()
    expect(new URL(url).searchParams.get('client_id')).toBe('gh')
    expect(calls.some((c) => c.url.endsWith('/register'))).toBe(false)
    expect(await storage.get(`p:client:${ISSUER}`)).toBeNull()
  })

  it('registers a public client and keeps a returned secret', async () => {
    let body: unknown
    const { auth, calls } = make(
      tokenRoutes({
        [`${ISSUER}/register`]: (init?: RequestInit) => {
          body = JSON.parse(String(init?.body))
          return json({ client_id: 'cid', client_secret: 'sec' })
        },
      }),
    )
    const { state } = await auth.startAuthorization()
    expect(body).toEqual({
      client_name: 'App',
      redirect_uris: ['https://app.test/mcp/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    })
    await auth.finishAuthorization({ state, code: 'c' })
    const tokenCall = calls.find((c) => c.url.endsWith('/token'))!
    expect(form(tokenCall.init).get('client_secret')).toBe('sec')
  })

  it('builds the authorization URL', async () => {
    const { auth } = make(tokenRoutes())
    const { url, state } = await auth.startAuthorization()
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe(`${ISSUER}/authorize`)
    const q = u.searchParams
    expect(q.get('response_type')).toBe('code')
    expect(q.get('client_id')).toBe('cid')
    expect(q.get('redirect_uri')).toBe('https://app.test/mcp/callback')
    expect(q.get('code_challenge')).toMatch(/^[\w-]{43}$/)
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('state')).toBe(state)
    expect(q.get('resource')).toBe(SERVER)
    expect(q.get('scope')).toBe('a b')
  })

  it('uses the scope option only when the challenge and metadata give none', async () => {
    const noScopes = { ...tokenRoutes(), 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': { ...PRM, scopes_supported: undefined } }
    const fallback = make(noScopes, { scope: 'repo read:org' })
    expect(new URL((await fallback.auth.startAuthorization()).url).searchParams.get('scope')).toBe('repo read:org')

    const fromMetadata = make(tokenRoutes(), { scope: 'repo read:org' })
    expect(new URL((await fromMetadata.auth.startAuthorization()).url).searchParams.get('scope')).toBe('a b')

    const fromChallenge = make(tokenRoutes(), { scope: 'repo read:org' })
    await fromChallenge.auth.onUnauthorized({ scope: 'from-challenge' })
    expect(new URL((await fromChallenge.auth.startAuthorization()).url).searchParams.get('scope')).toBe('from-challenge')
  })

  it('clientKeyPrefix keys only the client registration', async () => {
    const { auth, storage } = make(tokenRoutes(), { clientKeyPrefix: 'shared:' })
    const { state } = await auth.startAuthorization()
    expect(await storage.get(`shared:client:${ISSUER}`)).toContain('cid')
    expect(await storage.get(`p:client:${ISSUER}`)).toBeNull()
    expect(await storage.get(`p:discovery:${SERVER}`)).not.toBeNull()
    expect(await storage.get(`p:pending:${state}`)).not.toBeNull()
    await auth.finishAuthorization({ state, code: 'c' })
    expect(await storage.get(`p:tokens:${SERVER}`)).not.toBeNull()
  })

  it('exchanges the code and stores tokens with expires_at', async () => {
    const { auth, calls, storage } = make(tokenRoutes())
    const { state } = await auth.startAuthorization()
    await auth.finishAuthorization({ state, code: 'the-code' })
    const call = calls.find((c) => c.url.endsWith('/token'))!
    const f = form(call.init)
    expect(f.get('grant_type')).toBe('authorization_code')
    expect(f.get('code')).toBe('the-code')
    expect(f.get('redirect_uri')).toBe('https://app.test/mcp/callback')
    expect(f.get('client_id')).toBe('cid')
    expect(f.get('code_verifier')).toBeTruthy()
    expect(f.get('resource')).toBe(SERVER)
    expect((call.init?.headers as Record<string, string>).Accept).toBe('application/json')
    const stored = JSON.parse((await storage.get(`p:tokens:${SERVER}`))!)
    expect(stored.expires_at).toBe(Date.now() + 3600 * 1000)
    expect(await auth.accessToken()).toBe('at')
  })

  it('finishAuthorization is single use and rejects unknown or expired state', async () => {
    const { auth } = make(tokenRoutes())
    await expect(auth.finishAuthorization({ state: 'nope', code: 'c' })).rejects.toMatchObject({
      code: 'invalid_state',
    })
    const { state } = await auth.startAuthorization()
    await auth.finishAuthorization({ state, code: 'c' })
    await expect(auth.finishAuthorization({ state, code: 'c' })).rejects.toBeInstanceOf(MCPAuthError)

    const second = await auth.startAuthorization()
    vi.setSystemTime(Date.now() + 601_000)
    await expect(auth.finishAuthorization({ state: second.state, code: 'c' })).rejects.toMatchObject({
      code: 'invalid_state',
    })
  })

  it('rejects a provider error and consumes the pending entry', async () => {
    const { auth, storage } = make(tokenRoutes())
    const { state } = await auth.startAuthorization()
    await expect(
      auth.finishAuthorization({ state, error: 'access_denied', errorDescription: 'no thanks' }),
    ).rejects.toMatchObject({ code: 'access_denied', description: 'no thanks' })
    expect(await storage.get(`p:pending:${state}`)).toBeNull()
  })

  async function signedIn(refreshRoute: Route) {
    const ctx = make(tokenRoutes({ [`${ISSUER}/token`]: refreshRoute }))
    const { state } = await ctx.auth.startAuthorization()
    await ctx.auth.finishAuthorization({ state, code: 'c' })
    return ctx
  }

  it('accessToken refreshes when expired, sharing one in-flight request', async () => {
    let n = 0
    const ctx = await signedIn((init) => {
      const f = form(init)
      if (f.get('grant_type') === 'refresh_token') {
        n++
        return json({ access_token: 'at2', token_type: 'Bearer', expires_in: 3600 })
      }
      return json({ access_token: 'at', token_type: 'Bearer', refresh_token: 'rt', expires_in: 3600 })
    })
    vi.setSystemTime(Date.now() + 3600_000 - 30_000)
    const [a, b] = await Promise.all([ctx.auth.accessToken(), ctx.auth.accessToken()])
    expect([a, b]).toEqual(['at2', 'at2'])
    expect(n).toBe(1)
    const refreshCall = ctx.calls.filter((c) => c.url.endsWith('/token')).at(-1)!
    expect(form(refreshCall.init).get('refresh_token')).toBe('rt')
    const stored = JSON.parse((await ctx.storage.get(`p:tokens:${SERVER}`))!)
    expect(stored.refresh_token).toBe('rt')
  })

  it('onUnauthorized returns needs-auth when refresh fails with invalid_grant', async () => {
    const ctx = await signedIn((init) =>
      form(init).get('grant_type') === 'refresh_token'
        ? json({ error: 'invalid_grant' }, 400)
        : json({ access_token: 'at', token_type: 'Bearer', refresh_token: 'rt', expires_in: 3600 }),
    )
    expect(await ctx.auth.onUnauthorized({})).toBe('needs-auth')
    expect(await ctx.storage.get(`p:tokens:${SERVER}`)).toBeNull()
  })

  it('onUnauthorized retries after a successful refresh', async () => {
    const ctx = await signedIn(() =>
      json({ access_token: 'at', token_type: 'Bearer', refresh_token: 'rt', expires_in: 3600 }),
    )
    expect(await ctx.auth.onUnauthorized({})).toBe('retry')
  })

  it('keeps tokens and rethrows on a 503 during refresh, removes them on invalid_grant', async () => {
    const ctx = await signedIn((init) =>
      form(init).get('grant_type') === 'refresh_token'
        ? new Response('down', { status: 503 })
        : json({ access_token: 'at', token_type: 'Bearer', refresh_token: 'rt', expires_in: 3600 }),
    )
    await expect(ctx.auth.onUnauthorized({})).rejects.toMatchObject({ status: 503 })
    expect(await ctx.storage.get(`p:tokens:${SERVER}`)).not.toBeNull()
  })

  it('rejects a pending flow created for another server and exchanges against the snapshot', async () => {
    const shared = resolveMCPStorage('memory')
    const mk = (serverUrl: string, r: ReturnType<typeof router>) =>
      createMCPAuth({ serverUrl, storage: shared, clientName: 'App', redirectUri: 'https://app.test/mcp/callback', fetch: r.fetch })
    const r1 = router(tokenRoutes())
    const a = mk(SERVER, r1)
    const { state } = await a.startAuthorization()
    const other = 'https://mcp.other.test/mcp'
    const r2 = router({
      'https://mcp.other.test/.well-known/oauth-protected-resource/mcp': { ...PRM, resource: other },
      [`${ISSUER}/.well-known/oauth-authorization-server`]: AS_META,
      [`${ISSUER}/token`]: () => json({ access_token: 'x', token_type: 'Bearer' }),
    })
    await expect(mk(other, r2).finishAuthorization({ state, code: 'c' })).rejects.toMatchObject({ code: 'invalid_state' })
    expect(r2.calls.some((c) => c.url.endsWith('/token'))).toBe(false)

    // same server, discovery changed after start: exchange still hits the original token endpoint
    const { state: s2 } = await a.startAuthorization()
    await shared.set(
      `discovery:${SERVER}`,
      JSON.stringify({ resource: SERVER, metadata: { ...AS_META, token_endpoint: 'https://evil.test/token' } }),
    )
    await a.finishAuthorization({ state: s2, code: 'c' })
    expect(r1.calls.filter((c) => c.url === `${ISSUER}/token`).length).toBe(1)
    expect(r1.calls.some((c) => c.url === 'https://evil.test/token')).toBe(false)
  })

  it('logout removes tokens but keeps the client registration', async () => {
    const ctx = await signedIn(() =>
      json({ access_token: 'at', token_type: 'Bearer', refresh_token: 'rt', expires_in: 3600 }),
    )
    await ctx.auth.logout()
    expect(await ctx.auth.accessToken()).toBeUndefined()
    expect(await ctx.storage.get(`p:client:${ISSUER}`)).toContain('cid')
  })
})
