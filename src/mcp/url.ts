const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** https only; http only for local development */
export function checkUrl(input: string): URL | Error {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return new Error(`"${input}" is not a valid URL`)
  }
  if (url.protocol === 'https:') return url
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url
  return new Error(`MCP servers must use https:// (http:// only on localhost): ${input}`)
}

/** `mcp.example.com` → `example`, `api.foo.io` → `api` */
export function idFromHost(url: URL): string {
  let host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const stripped = host.replace(/^(mcp|www)\./, '')
  if (stripped.includes('.')) host = stripped
  return host.split('.')[0].replace(/[^a-z0-9-]/g, '') || 'server'
}

/** Limits on servers added by users, the same in the browser and on the backend */
export const MAX_CUSTOM_SERVERS = 20
export const MAX_URL_LENGTH = 2048
export const MAX_NAME_LENGTH = 100

/** `checkUrl` plus the length limits of a server added by the user */
export function checkCustom(input: string, name: string | undefined): URL | Error {
  if (input.length > MAX_URL_LENGTH) return new Error(`The URL is longer than ${MAX_URL_LENGTH} characters`)
  if (name !== undefined && name.length > MAX_NAME_LENGTH) return new Error(`The name is longer than ${MAX_NAME_LENGTH} characters`)
  return checkUrl(input)
}

/** Compares server URLs: case of the host, default port, fragment and trailing slashes don't count */
export function sameServerUrl(a: string | URL, b: string | URL): boolean {
  const key = (value: string | URL) => {
    try {
      const url = new URL(String(value))
      url.hash = ''
      url.pathname = url.pathname.replace(/\/+$/, '')
      return url.href
    } catch {
      return undefined
    }
  }
  const ka = key(a)
  return ka !== undefined && ka === key(b)
}
