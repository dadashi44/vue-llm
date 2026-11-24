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
