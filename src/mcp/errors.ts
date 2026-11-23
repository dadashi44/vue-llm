/** A non-2xx HTTP response from an MCP server */
export class MCPHTTPError extends Error {
  status: number
  body: string
  constructor(status: number, body: string, message?: string) {
    super(message ?? `MCP HTTP ${status}`)
    this.name = 'MCPHTTPError'
    this.status = status
    this.body = body
  }
}

/** The server can't be used from this environment */
export class MCPUnsupportedServerError extends Error {
  reason: 'cors' | 'no-registration' | 'no-pkce' | 'no-auth-metadata'
  constructor(reason: MCPUnsupportedServerError['reason'], message?: string) {
    super(message ?? `MCP server is not supported: ${reason}`)
    this.name = 'MCPUnsupportedServerError'
    this.reason = reason
  }
}

/** An OAuth error response (RFC 6749 `error` / `error_description`) */
export class MCPAuthError extends Error {
  code: string
  description?: string
  constructor(code: string, description?: string) {
    super(description ? `${code}: ${description}` : code)
    this.name = 'MCPAuthError'
    this.code = code
    this.description = description
  }
}

/** A JSON-RPC error returned by an MCP server */
export class MCPProtocolError extends Error {
  code: number
  data?: unknown
  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'MCPProtocolError'
    this.code = code
    this.data = data
  }
}
