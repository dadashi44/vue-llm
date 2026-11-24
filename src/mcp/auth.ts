import { MCPAuthError, MCPUnsupportedServerError } from './errors.js'
import {
  buildAuthorizationUrl,
  discoverAuth,
  exchangeCode,
  refreshTokens,
  registerClient,
  type AuthServerMetadata,
  type MCPAuthChallenge,
  type OAuthClient,
  type OAuthTokens,
} from './oauth.js'
import { createPKCE, randomString } from './pkce.js'
import type { MCPAuthStorage } from './storage.js'

export interface MCPAuth {
  accessToken(): Promise<string | undefined>
  onUnauthorized(c: MCPAuthChallenge): Promise<'retry' | 'needs-auth'>
  startAuthorization(): Promise<{ url: string; state: string }>
  finishAuthorization(p: {
    state: string
    code?: string
    error?: string
    errorDescription?: string
  }): Promise<void>
  logout(): Promise<void>
}

export interface CreateMCPAuthOptions {
  serverUrl: string
  storage: MCPAuthStorage
  pendingStorage?: MCPAuthStorage
  keyPrefix?: string
  clientName: string
  redirectUri: string
  fetch?: typeof fetch
  /** Pre-registered client (servers without dynamic registration); never stored */
  client?: OAuthClient
}

interface Discovery {
  resource: string
  scope?: string
  metadata: AuthServerMetadata
}

interface Pending {
  verifier: string
  expiresAt: number
  serverUrl: string
  redirectUri: string
  resource: string
  client: OAuthClient
  metadata: AuthServerMetadata
}

const PENDING_TTL_SECONDS = 600
const EXPIRY_SKEW_MS = 60_000

function parse<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

export function createMCPAuth(o: CreateMCPAuthOptions): MCPAuth {
  const fetchFn: typeof fetch = o.fetch ?? ((...args) => globalThis.fetch(...args))
  const prefix = o.keyPrefix ?? ''
  const pendingStorage = o.pendingStorage ?? o.storage
  const tokensKey = `${prefix}tokens:${o.serverUrl}`
  const discoveryKey = `${prefix}discovery:${o.serverUrl}`
  const clientKey = (issuer: string) => `${prefix}client:${issuer}`
  const pendingKey = (state: string) => `${prefix}pending:${state}`

  let refreshing: Promise<OAuthTokens | undefined> | undefined

  async function loadDiscovery(): Promise<Discovery | undefined> {
    return parse<Discovery>(await o.storage.get(discoveryKey))
  }

  async function discover(challenge: MCPAuthChallenge): Promise<Discovery> {
    const d = await discoverAuth(o.serverUrl, challenge, fetchFn)
    if (!o.client && !d.metadata.registration_endpoint) {
      const stored = await o.storage.get(clientKey(d.metadata.issuer))
      if (!stored) {
        throw new MCPUnsupportedServerError(
          'no-registration',
          `${o.serverUrl} does not support dynamic client registration; pass a pre-registered client`,
        )
      }
    }
    await o.storage.set(discoveryKey, JSON.stringify(d))
    return d
  }

  async function ensureDiscovery(): Promise<Discovery> {
    return (await loadDiscovery()) ?? discover({})
  }

  async function loadClient(d: Discovery): Promise<OAuthClient | undefined> {
    if (o.client) return o.client
    return parse<OAuthClient>(await o.storage.get(clientKey(d.metadata.issuer)))
  }

  async function loadTokens(): Promise<OAuthTokens | undefined> {
    return parse<OAuthTokens>(await o.storage.get(tokensKey))
  }

  const isExpired = (t: OAuthTokens) =>
    t.expires_at !== undefined && Date.now() >= t.expires_at - EXPIRY_SKEW_MS

  /** Refresh and store; resolves undefined when the grant is no longer valid (tokens removed) */
  function refresh(tokens: OAuthTokens): Promise<OAuthTokens | undefined> {
    if (refreshing) return refreshing
    refreshing = (async () => {
      try {
        if (!tokens.refresh_token) return undefined
        const d = await ensureDiscovery()
        const client = await loadClient(d)
        if (!client) return undefined
        const next = await refreshTokens(
          d.metadata,
          { client, refreshToken: tokens.refresh_token, resource: d.resource },
          fetchFn,
        )
        await o.storage.set(tokensKey, JSON.stringify(next))
        return next
      } catch (e) {
        if (e instanceof MCPAuthError && (e.code === 'invalid_grant' || e.code === 'invalid_client')) {
          await o.storage.remove(tokensKey)
          return undefined
        }
        throw e
      } finally {
        refreshing = undefined
      }
    })()
    return refreshing
  }

  return {
    async accessToken() {
      const tokens = await loadTokens()
      if (!tokens) return undefined
      if (!isExpired(tokens)) return tokens.access_token
      if (!tokens.refresh_token) return undefined
      return (await refresh(tokens))?.access_token
    },

    async onUnauthorized(challenge) {
      const tokens = await loadTokens()
      if (tokens?.refresh_token) {
        if (await refresh(tokens)) return 'retry'
      } else if (tokens) {
        await o.storage.remove(tokensKey)
      }
      await discover(challenge)
      return 'needs-auth'
    },

    async startAuthorization() {
      const d = await ensureDiscovery()
      let client = await loadClient(d)
      if (!client) {
        client = await registerClient(
          d.metadata,
          { clientName: o.clientName, redirectUri: o.redirectUri },
          fetchFn,
        )
        await o.storage.set(clientKey(d.metadata.issuer), JSON.stringify(client))
      }
      let pkce: { verifier: string; challenge: string }
      try {
        pkce = await createPKCE()
      } catch {
        throw new MCPUnsupportedServerError(
          'no-pkce',
          'Web Crypto (crypto.subtle) is unavailable: sign-in requires a secure context (https or localhost)',
        )
      }
      const state = randomString(16)
      const pending: Pending = {
        verifier: pkce.verifier,
        expiresAt: Date.now() + PENDING_TTL_SECONDS * 1000,
        serverUrl: o.serverUrl,
        redirectUri: o.redirectUri,
        resource: d.resource,
        client,
        metadata: d.metadata,
      }
      await pendingStorage.set(pendingKey(state), JSON.stringify(pending), {
        ttl: PENDING_TTL_SECONDS,
      })
      const url = buildAuthorizationUrl(d.metadata, {
        client,
        redirectUri: o.redirectUri,
        challenge: pkce.challenge,
        state,
        resource: d.resource,
        scope: d.scope,
      })
      return { url, state }
    },

    async finishAuthorization(p) {
      const key = pendingKey(p.state)
      const pending = parse<Pending>(await pendingStorage.get(key))
      await pendingStorage.remove(key)
      if (!pending || pending.serverUrl !== o.serverUrl || Date.now() >= pending.expiresAt) {
        throw new MCPAuthError('invalid_state', 'Unknown or expired authorization state')
      }
      if (p.error) throw new MCPAuthError(p.error, p.errorDescription)
      if (!p.code) throw new MCPAuthError('invalid_request', 'Authorization response has no code')
      const tokens = await exchangeCode(
        pending.metadata,
        {
          client: pending.client,
          code: p.code,
          verifier: pending.verifier,
          redirectUri: pending.redirectUri,
          resource: pending.resource,
        },
        fetchFn,
      )
      await o.storage.set(tokensKey, JSON.stringify(tokens))
    },

    async logout() {
      await o.storage.remove(tokensKey)
    },
  }
}
