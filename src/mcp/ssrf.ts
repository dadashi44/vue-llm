import { MCPUnsupportedServerError } from './errors.js'

/** Resolves a host name to its IP addresses (`node:dns` lookup, or your own DNS) */
export type MCPHostResolver = (host: string) => Promise<string[]>

export interface MCPHostGuardOptions {
  /** Only hosts matching these patterns are allowed: `example.com` or `*.example.com` */
  allowHosts?: string[]
  /** When given, the host is resolved and rejected if any address is private */
  resolve?: MCPHostResolver
}

export interface MCPGuardedFetchOptions extends MCPHostGuardOptions {
  /** Hosts configured by the developer: requests to them skip the checks (their redirects don't) */
  trusted?: (url: URL) => boolean
}

const MAX_REDIRECTS = 5
/** Names that always point inside the network */
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal']
const LOCAL_NAMES = new Set(['localhost', 'metadata', 'metadata.google.internal'])

function blocked(message: string): MCPUnsupportedServerError {
  return new MCPUnsupportedServerError('blocked-host', message)
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

export function matchesHost(host: string, patterns: string[]): boolean {
  const h = normalizeHost(host)
  return patterns.some((p) => {
    const pattern = normalizeHost(p.trim())
    return pattern.startsWith('*.') ? h.endsWith(pattern.slice(1)) : h === pattern
  })
}

function parseIPv4(s: string): number[] | undefined {
  const parts = s.split('.')
  if (parts.length !== 4) return undefined
  const bytes = parts.map(p => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  return bytes.every(b => b >= 0 && b <= 255) ? bytes : undefined
}

/** Eight 16-bit groups; accepts `::` and a trailing dotted IPv4 part */
function parseIPv6(input: string): number[] | undefined {
  let s = input.replace(/%.*$/, '') // zone id
  if (!s.includes(':')) return undefined
  let tail: number[] = []
  const lastColon = s.lastIndexOf(':')
  if (s.slice(lastColon + 1).includes('.')) {
    const v4 = parseIPv4(s.slice(lastColon + 1))
    if (!v4) return undefined
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]]
    s = s.slice(0, lastColon + 1)
    if (!s.endsWith('::')) s = s.slice(0, -1)
  }
  const halves = s.split('::')
  if (halves.length > 2) return undefined
  const group = (part: string) => (part ? part.split(':') : [])
  const head = group(halves[0])
  const rest = halves.length === 2 ? group(halves[1]) : []
  const parse = (g: string) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN)
  const known = [...head.map(parse), ...rest.map(parse)]
  if (known.some(Number.isNaN)) return undefined
  const missing = 8 - known.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined
  return [...head.map(parse), ...Array<number>(Math.max(missing, 0)).fill(0), ...rest.map(parse), ...tail]
}

function isPrivateIPv4([a, b, c]: number[]): boolean {
  return a === 0 // "this network"
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    || (a === 169 && b === 254) // link-local, cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 0) // IETF protocol assignments
    || (a === 198 && (b === 18 || b === 19)) // benchmarking
    || a >= 224 // multicast, reserved, broadcast
}

function isPrivateIPv6(g: number[]): boolean {
  const zeros = (from: number, to: number) => g.slice(from, to).every(x => x === 0)
  const v4 = () => [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]
  if (zeros(0, 8)) return true // ::
  if (zeros(0, 7) && g[7] === 1) return true // ::1
  if (zeros(0, 5) && g[5] === 0xffff) return isPrivateIPv4(v4()) // IPv4-mapped
  if (zeros(0, 6)) return isPrivateIPv4(v4()) // IPv4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isPrivateIPv4(v4()) // NAT64
  return (g[0] & 0xfe00) === 0xfc00 // unique local fc00::/7
    || (g[0] & 0xffc0) === 0xfe80 // link-local
    || (g[0] & 0xffc0) === 0xfec0 // site-local (deprecated)
    || (g[0] & 0xff00) === 0xff00 // multicast
}

/** `true`/`false` for an IP literal, `undefined` for a name */
function isPrivateAddress(address: string): boolean | undefined {
  const host = normalizeHost(address)
  const v4 = parseIPv4(host)
  if (v4) return isPrivateIPv4(v4)
  const v6 = parseIPv6(host)
  if (v6) return isPrivateIPv6(v6)
  return undefined
}

/**
 * Rejects URLs the backend must not fetch on a user's behalf: anything but https, literal
 * loopback/private/link-local/metadata addresses and `localhost`-style names; with `allowHosts`,
 * hosts outside those patterns; with `resolve`, names that resolve to a private address.
 * Throws `MCPUnsupportedServerError` (reason `'blocked-host'`).
 */
export async function assertPublicHost(url: URL, o: MCPHostGuardOptions): Promise<void> {
  const host = normalizeHost(url.hostname)
  if (url.protocol !== 'https:') throw blocked(`${url.origin} is not allowed: MCP servers must use https://`)
  const literal = isPrivateAddress(host)
  if (literal === true || (literal === undefined && (LOCAL_NAMES.has(host) || LOCAL_SUFFIXES.some(s => host.endsWith(s))))) {
    throw blocked(`${host} is a loopback, private or link-local address and is not allowed`)
  }
  if (o.allowHosts && !matchesHost(host, o.allowHosts)) throw blocked(`${host} is not an allowed MCP host`)
  if (literal !== undefined || !o.resolve) return
  const addresses = await o.resolve(host)
  for (const address of addresses) {
    if (isPrivateAddress(address) !== false) throw blocked(`${host} resolves to a private address (${address}) and is not allowed`)
  }
}

/**
 * `fetch` that checks every URL with `assertPublicHost` before connecting and follows
 * redirects itself (at most 5), checking each hop. `Authorization` is dropped on a
 * cross-origin hop; 303 (and 301/302 after POST) continue as GET without a body.
 */
export function guardedFetch(fetchFn: typeof fetch, o: MCPGuardedFetchOptions): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined
    let url = new URL(request ? request.url : String(input))
    const mode = init?.redirect ?? request?.redirect ?? 'follow'
    let method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers ?? request?.headers)
    let body = init?.body
    for (let hop = 0; ; hop++) {
      if (!o.trusted?.(url)) await assertPublicHost(url, o)
      const response = hop === 0
        ? await fetchFn(input, { ...init, redirect: 'manual' })
        : await fetchFn(url.href, { ...init, method, headers, body, redirect: 'manual' })
      const location = response.headers.get('Location')
      const redirect = response.status >= 300 && response.status < 400 && response.status !== 304 && location
      if (!redirect || mode === 'manual') return response
      void response.body?.cancel().catch(() => {})
      if (mode === 'error') throw new TypeError(`Unexpected redirect from ${url.host}`)
      if (hop >= MAX_REDIRECTS) throw new TypeError(`Too many redirects from ${url.host}`)
      if ((response.status === 303 && method !== 'HEAD') || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET'
        body = undefined
        headers.delete('Content-Type')
      } else if (request?.body && !init?.body) {
        throw new TypeError(`Cannot repeat the request body after a redirect from ${url.host}`)
      }
      const next = new URL(location, url)
      if (next.origin !== url.origin) headers.delete('Authorization')
      url = next
    }
  }
}

/**
 * A resolver backed by `node:dns` (Node, Bun, Deno), or `undefined` where it can't be loaded
 * (Workers, edge functions). The import is dynamic so edge bundles don't break.
 */
export async function loadNodeResolver(): Promise<MCPHostResolver | undefined> {
  try {
    const dns = await import('node:dns')
    const lookup = dns.promises?.lookup
    if (typeof lookup !== 'function') return undefined
    return async host => (await lookup(host, { all: true, verbatim: true })).map(a => a.address)
  } catch {
    return undefined
  }
}
