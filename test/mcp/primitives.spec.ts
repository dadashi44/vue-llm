import { describe, it, expect, vi, afterEach } from 'vitest'
import { MCPHTTPError, MCPUnsupportedServerError, MCPAuthError, MCPProtocolError } from '../../src/mcp/errors'
import { resolveMCPStorage } from '../../src/mcp/storage'
import type { MCPAuthStorage } from '../../src/mcp/storage'
import { createPKCE, randomString } from '../../src/mcp/pkce'

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('PKCE', () => {
  it('challenge is base64url(SHA-256(verifier))', async () => {
    const { verifier, challenge } = await createPKCE()
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    expect(challenge).toBe(b64url(new Uint8Array(digest)))
  })

  it('verifier is 43-128 unreserved characters and differs per call', async () => {
    const a = await createPKCE()
    const b = await createPKCE()
    expect(a.verifier.length).toBeGreaterThanOrEqual(43)
    expect(a.verifier.length).toBeLessThanOrEqual(128)
    expect(a.verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    expect(a.verifier).not.toBe(b.verifier)
  })

  it('randomString is base64url and honours the byte count', () => {
    expect(randomString(16)).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(randomString()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('resolveMCPStorage', () => {
  it('\'local\' (default) writes prefixed keys to localStorage', async () => {
    const s = resolveMCPStorage()
    await s.set('k', 'v')
    expect(localStorage.getItem('vue-llm:mcp:k')).toBe('v')
    expect(await s.get('k')).toBe('v')
    await s.remove('k')
    expect(localStorage.getItem('vue-llm:mcp:k')).toBeNull()
    expect(await s.get('k')).toBeNull()
  })

  it('\'session\' uses sessionStorage', async () => {
    const s = resolveMCPStorage('session')
    await s.set('k', 'v')
    expect(sessionStorage.getItem('vue-llm:mcp:k')).toBe('v')
    expect(localStorage.getItem('vue-llm:mcp:k')).toBeNull()
  })

  it('\'memory\' touches neither Web Storage and is per call', async () => {
    const setL = vi.spyOn(Storage.prototype, 'setItem')
    const s = resolveMCPStorage('memory')
    await s.set('k', 'v')
    expect(await s.get('k')).toBe('v')
    expect(setL).not.toHaveBeenCalled()
    expect(await resolveMCPStorage('memory').get('k')).toBeNull()
    await s.remove('k')
    expect(await s.get('k')).toBeNull()
  })

  it('returns a custom adapter as is', () => {
    const custom: MCPAuthStorage = { get: () => null, set: () => {}, remove: () => {} }
    expect(resolveMCPStorage(custom)).toBe(custom)
  })

  it('falls back to memory when localStorage.setItem throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const s = resolveMCPStorage('local')
    await s.set('k', 'v')
    expect(await s.get('k')).toBe('v')
    await s.remove('k')
    expect(await s.get('k')).toBeNull()
  })
})

describe('errors', () => {
  it('MCPHTTPError', () => {
    const e = new MCPHTTPError(401, 'nope')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(MCPHTTPError)
    expect(e.status).toBe(401)
    expect(e.body).toBe('nope')
  })

  it('MCPUnsupportedServerError', () => {
    const e = new MCPUnsupportedServerError('cors')
    expect(e).toBeInstanceOf(Error)
    expect(e.reason).toBe('cors')
  })

  it('MCPAuthError', () => {
    const e = new MCPAuthError('invalid_grant', 'expired')
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('invalid_grant')
    expect(e.description).toBe('expired')
  })

  it('MCPProtocolError', () => {
    const e = new MCPProtocolError(-32601, 'Method not found', { m: 1 })
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe(-32601)
    expect(e.message).toBe('Method not found')
    expect(e.data).toEqual({ m: 1 })
  })
})
