/* eslint-disable @typescript-eslint/no-explicit-any -- untrusted JSON metadata */
import { MCPAuthError, MCPHTTPError, MCPUnsupportedServerError } from './errors.js'

export interface MCPAuthChallenge {
  resourceMetadata?: string
  scope?: string
}

export interface AuthServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  code_challenge_methods_supported?: string[]
  token_endpoint_auth_methods_supported?: string[]
  [key: string]: unknown
}

export interface OAuthClient {
  client_id: string
  client_secret?: string
}

export interface OAuthTokens {
  access_token: string
  token_type: string
  refresh_token?: string
  scope?: string
  /** Epoch milliseconds */
  expires_at?: number
}

/** Reads `resource_metadata` and `scope` from a `WWW-Authenticate: Bearer ...` header */
export function parseWWWAuthenticate(header: string | null): MCPAuthChallenge {
  const out: MCPAuthChallenge = {}
  if (!header) return out
  const re = /([a-zA-Z_][\w-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(header))) {
    const value = m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : m[3]
    const key = m[1].toLowerCase()
    if (key === 'resource_metadata') out.resourceMetadata = value
    else if (key === 'scope') out.scope = value
  }
  return out
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** https, or http only for loopback hosts */
function isSafeUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname))
  } catch {
    return false
  }
}

function sameResource(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    const path = (u: URL) => u.pathname.replace(/\/+$/, '')
    return ua.origin === ub.origin && path(ua) === path(ub) && ua.search === ub.search
  } catch {
    return false
  }
}

async function getJSON(url: string, fetchFn: typeof fetch): Promise<Record<string, any> | undefined> {
  try {
    const res = await fetchFn(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return undefined
    const data = await res.json()
    return data && typeof data === 'object' ? data : undefined
  } catch {
    return undefined
  }
}

export async function discoverAuth(
  serverUrl: string,
  challenge: MCPAuthChallenge,
  fetchFn: typeof fetch,
): Promise<{ resource: string; scope?: string; metadata: AuthServerMetadata }> {
  const server = new URL(serverUrl)
  const path = server.pathname === '/' ? '' : server.pathname.replace(/\/$/, '')

  const prmUrls: string[] = []
  if (isSafeUrl(challenge.resourceMetadata)) prmUrls.push(challenge.resourceMetadata)
  prmUrls.push(`${server.origin}/.well-known/oauth-protected-resource${path}`)
  if (path) prmUrls.push(`${server.origin}/.well-known/oauth-protected-resource`)

  let prm: Record<string, any> | undefined
  for (const url of [...new Set(prmUrls)]) {
    prm = await getJSON(url, fetchFn)
    if (prm) break
  }
  const issuerUrl: unknown = prm?.authorization_servers?.[0]
  if (!prm || !isSafeUrl(issuerUrl)) {
    throw new MCPUnsupportedServerError(
      'no-auth-metadata',
      `No OAuth protected-resource metadata found for ${serverUrl}`,
    )
  }

  const issuer = new URL(issuerUrl)
  const issuerPath = issuer.pathname === '/' ? '' : issuer.pathname.replace(/\/$/, '')
  const issuerBase = `${issuer.origin}${issuerPath}`
  const asUrls = [
    `${issuer.origin}/.well-known/oauth-authorization-server${issuerPath}`,
    `${issuerBase}/.well-known/oauth-authorization-server`,
    `${issuer.origin}/.well-known/openid-configuration${issuerPath}`,
    `${issuerBase}/.well-known/openid-configuration`,
  ]
  let metadata: AuthServerMetadata | undefined
  for (const url of [...new Set(asUrls)]) {
    const found = await getJSON(url, fetchFn)
    if (!found || !isSafeUrl(found.authorization_endpoint) || !isSafeUrl(found.token_endpoint)) continue
    if (found.issuer !== undefined && found.issuer !== issuerUrl) continue
    if (found.registration_endpoint !== undefined && !isSafeUrl(found.registration_endpoint)) continue
    metadata = { ...found, issuer: issuerUrl } as AuthServerMetadata
    break
  }
  if (!metadata) {
    throw new MCPUnsupportedServerError(
      'no-auth-metadata',
      `No authorization server metadata found for ${issuerUrl}`,
    )
  }
  if (!metadata.code_challenge_methods_supported?.includes('S256')) {
    throw new MCPUnsupportedServerError(
      'no-pkce',
      `Authorization server ${issuerUrl} does not support PKCE S256`,
    )
  }

  const scopes: unknown = prm.scopes_supported
  const scope =
    challenge.scope ||
    (Array.isArray(scopes) && scopes.length ? scopes.join(' ') : undefined)
  if (prm.resource !== undefined && !(typeof prm.resource === 'string' && sameResource(prm.resource, serverUrl))) {
    throw new MCPUnsupportedServerError(
      'no-auth-metadata',
      `Protected-resource metadata is for ${String(prm.resource)}, not ${serverUrl}`,
    )
  }
  const resource = typeof prm.resource === 'string' && prm.resource ? prm.resource : serverUrl
  return { resource, ...(scope ? { scope } : {}), metadata }
}

async function readError(res: Response): Promise<never> {
  const text = await res.text().catch(() => '')
  try {
    const data = JSON.parse(text)
    if (data && typeof data.error === 'string') {
      throw new MCPAuthError(data.error, data.error_description)
    }
  } catch (e) {
    if (e instanceof MCPAuthError) throw e
  }
  throw new MCPHTTPError(res.status, text.slice(0, 500))
}

export async function registerClient(
  metadata: AuthServerMetadata,
  p: { clientName: string; redirectUri: string },
  fetchFn: typeof fetch,
): Promise<OAuthClient> {
  if (!metadata.registration_endpoint) {
    throw new MCPUnsupportedServerError('no-registration')
  }
  const res = await fetchFn(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      client_name: p.clientName,
      redirect_uris: [p.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  })
  if (!res.ok) await readError(res)
  const data = await res.json()
  if (!data || typeof data.client_id !== 'string') {
    throw new MCPAuthError('invalid_client', 'Registration response has no client_id')
  }
  return {
    client_id: data.client_id,
    ...(typeof data.client_secret === 'string' && data.client_secret
      ? { client_secret: data.client_secret }
      : {}),
  }
}

export function buildAuthorizationUrl(
  metadata: AuthServerMetadata,
  p: {
    client: OAuthClient
    redirectUri: string
    challenge: string
    state: string
    resource: string
    scope?: string
  },
): string {
  const url = new URL(metadata.authorization_endpoint)
  const q = url.searchParams
  q.set('response_type', 'code')
  q.set('client_id', p.client.client_id)
  q.set('redirect_uri', p.redirectUri)
  q.set('code_challenge', p.challenge)
  q.set('code_challenge_method', 'S256')
  q.set('state', p.state)
  q.set('resource', p.resource)
  if (p.scope) q.set('scope', p.scope)
  return url.toString()
}

async function tokenRequest(
  metadata: AuthServerMetadata,
  client: OAuthClient,
  fields: Record<string, string>,
  fetchFn: typeof fetch,
  previousRefreshToken?: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams(fields)
  body.set('client_id', client.client_id)
  if (client.client_secret) body.set('client_secret', client.client_secret)
  const res = await fetchFn(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: body.toString(),
  })
  if (!res.ok) await readError(res)
  const data = await res.json()
  if (!data || typeof data.access_token !== 'string') {
    throw new MCPAuthError('invalid_token_response', 'Token response has no access_token')
  }
  const expiresIn = Number(data.expires_in)
  return {
    access_token: data.access_token,
    token_type: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
    ...((data.refresh_token ?? previousRefreshToken)
      ? { refresh_token: data.refresh_token ?? previousRefreshToken }
      : {}),
    ...(typeof data.scope === 'string' ? { scope: data.scope } : {}),
    ...(Number.isFinite(expiresIn) && data.expires_in != null
      ? { expires_at: Date.now() + expiresIn * 1000 }
      : {}),
  }
}

export function exchangeCode(
  metadata: AuthServerMetadata,
  p: { client: OAuthClient; code: string; verifier: string; redirectUri: string; resource: string },
  fetchFn: typeof fetch,
): Promise<OAuthTokens> {
  return tokenRequest(
    metadata,
    p.client,
    {
      grant_type: 'authorization_code',
      code: p.code,
      redirect_uri: p.redirectUri,
      code_verifier: p.verifier,
      resource: p.resource,
    },
    fetchFn,
  )
}

export function refreshTokens(
  metadata: AuthServerMetadata,
  p: { client: OAuthClient; refreshToken: string; resource: string },
  fetchFn: typeof fetch,
): Promise<OAuthTokens> {
  return tokenRequest(
    metadata,
    p.client,
    { grant_type: 'refresh_token', refresh_token: p.refreshToken, resource: p.resource },
    fetchFn,
    p.refreshToken,
  )
}
