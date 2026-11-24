import { SSEParserStream } from '../core/sse-parser.js'
import type { MCPAuth } from './auth.js'
import { MCPAuthError, MCPHTTPError, MCPProtocolError, MCPUnsupportedServerError } from './errors.js'
import { parseWWWAuthenticate, type MCPAuthChallenge } from './oauth.js'
import type { MCPCallToolResult, MCPClient, MCPToolInfo } from './tools.js'

const PROTOCOL_VERSION = '2025-06-18'
const BODY_EXCERPT_LENGTH = 500

export interface MCPClientOptions {
  /** The Streamable HTTP endpoint of the MCP server */
  url: string
  /** OAuth for servers that need sign-in */
  auth?: MCPAuth
  fetch?: typeof fetch
  /** Sent in `initialize` */
  clientInfo?: { name: string; version: string }
}

export type MCPConnectResult =
  | { status: 'ready'; serverInfo: { name: string; version: string }; protocolVersion: string }
  | { status: 'needs-auth'; challenge: MCPAuthChallenge }

/** An MCP client over Streamable HTTP, usable with `mcpTools` */
export interface MCPHttpClient extends MCPClient {
  /** Runs `initialize` + `notifications/initialized`; resolves `needs-auth` on 401 */
  connect(): Promise<MCPConnectResult>
  /** Ends the session (`DELETE` with the session id), if the server gave one */
  close(): Promise<void>
  /**
   * Sends `initialize` with a placeholder `Authorization` header to check that the server's CORS
   * policy lets browsers send one. Throws `MCPUnsupportedServerError('cors')` when it doesn't.
   */
  probeAuthorizationHeader(): Promise<void>
}

interface JSONRPCMessage {
  jsonrpc: '2.0'
  id?: number | string | null
  method?: string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface SendOptions {
  signal?: AbortSignal
  /** Overrides the access token, e.g. the placeholder of the CORS probe */
  authorization?: string
  /** Leaves out the session headers (initialize, probe) */
  bare?: boolean
}

type Outcome<T> = { ok: true; value: T } | { ok: false; challenge: MCPAuthChallenge }

/**
 * A dependency-free MCP client over Streamable HTTP (JSON-RPC over `POST`, answered with
 * `application/json` or `text/event-stream`). A server that sends no `Mcp-Session-Id` is
 * treated as stateless.
 */
export function createMCPClient(o: MCPClientOptions): MCPHttpClient {
  const fetchFn: typeof fetch = o.fetch ?? ((...args) => globalThis.fetch(...args))
  const clientInfo = o.clientInfo ?? { name: 'vue-llm', version: '1.0.0' }
  let nextId = 1
  let sessionId: string | undefined
  let protocolVersion: string | undefined

  async function send(method: 'POST' | 'DELETE', body: unknown, options: SendOptions = {}): Promise<Response> {
    const headers = new Headers()
    if (method === 'POST') {
      headers.set('Content-Type', 'application/json')
      headers.set('Accept', 'application/json, text/event-stream')
    }
    const authorization = options.authorization
      ?? await o.auth?.accessToken().then(token => (token ? `Bearer ${token}` : undefined))
    if (authorization) headers.set('Authorization', authorization)
    if (!options.bare) {
      if (sessionId) headers.set('Mcp-Session-Id', sessionId)
      if (protocolVersion) headers.set('MCP-Protocol-Version', protocolVersion)
    }

    try {
      return await fetchFn(o.url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: options.signal,
      })
    } catch (error) {
      if (error instanceof TypeError) {
        throw new MCPUnsupportedServerError(
          'cors',
          `Could not reach the MCP server at ${o.url} (${error.message}). It may not allow browser access; use server mode.`,
        )
      }
      throw error
    }
  }

  async function httpError(response: Response): Promise<MCPHTTPError> {
    const text = await response.text().catch(() => '')
    const excerpt = text.slice(0, BODY_EXCERPT_LENGTH)
    if (response.status === 404 && sessionId) {
      sessionId = undefined
      return new MCPHTTPError(404, excerpt, 'MCP session expired (HTTP 404)')
    }
    return new MCPHTTPError(response.status, excerpt, `MCP HTTP ${response.status}${excerpt ? `: ${excerpt}` : ''}`)
  }

  /** Finds the JSON-RPC response with `id` in a JSON or SSE body */
  async function readResponse(response: Response, id: number): Promise<JSONRPCMessage> {
    const contentType = response.headers.get('Content-Type') ?? ''
    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new SSEParserStream())
        .getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const match = findResponse(parseJSON(value.data), id)
          if (match) return match
        }
      } finally {
        reader.cancel().catch(() => {})
      }
    } else {
      const text = await response.text()
      const match = text ? findResponse(parseJSON(text), id) : undefined
      if (match) return match
    }
    throw new MCPProtocolError(-32000, 'No response from the MCP server')
  }

  /** Sends one request, asking `auth` once on 401 */
  async function request<T>(method: string, params: unknown, options: SendOptions = {}): Promise<Outcome<T>> {
    const id = nextId++
    const body = { jsonrpc: '2.0', id, method, params }

    let response = await send('POST', body, options)
    if (response.status === 401) {
      const challenge = parseWWWAuthenticate(response.headers.get('WWW-Authenticate'))
      await response.body?.cancel().catch(() => {})
      if (!o.auth || (await o.auth.onUnauthorized(challenge)) !== 'retry') return { ok: false, challenge }
      response = await send('POST', body, options)
      if (response.status === 401) {
        const again = parseWWWAuthenticate(response.headers.get('WWW-Authenticate'))
        await response.body?.cancel().catch(() => {})
        return { ok: false, challenge: again }
      }
    }
    if (!response.ok) throw await httpError(response)

    if (method === 'initialize') {
      sessionId = response.headers.get('Mcp-Session-Id') ?? undefined
    }
    const message = await readResponse(response, id)
    if (message.error) {
      throw new MCPProtocolError(message.error.code, message.error.message, message.error.data)
    }
    return { ok: true, value: message.result as T }
  }

  async function call<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T> {
    const outcome = await request<T>(method, params, { signal })
    if (!outcome.ok) throw new MCPAuthError('unauthorized', 'The MCP server rejected the access token')
    return outcome.value
  }

  const initializeParams = { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo }

  return {
    async connect() {
      sessionId = undefined
      protocolVersion = undefined

      const outcome = await request<{ protocolVersion: string; serverInfo: { name: string; version: string } }>(
        'initialize',
        initializeParams,
        { bare: true },
      )
      if (!outcome.ok) return { status: 'needs-auth', challenge: outcome.challenge }

      protocolVersion = outcome.value.protocolVersion
      const notified = await send('POST', { jsonrpc: '2.0', method: 'notifications/initialized' })
      if (!notified.ok) throw await httpError(notified)
      await notified.body?.cancel().catch(() => {})

      return { status: 'ready', serverInfo: outcome.value.serverInfo, protocolVersion }
    },

    async close() {
      if (!sessionId) return
      try {
        const response = await send('DELETE', undefined)
        await response.body?.cancel().catch(() => {})
      } catch {
        // Best effort: the session expires on the server anyway
      }
      sessionId = undefined
    },

    async probeAuthorizationHeader() {
      const response = await send('POST', { jsonrpc: '2.0', id: nextId++, method: 'initialize', params: initializeParams }, { authorization: 'Bearer probe', bare: true })
        .catch((error: unknown) => {
          if (error instanceof MCPUnsupportedServerError) {
            throw new MCPUnsupportedServerError(
              'cors',
              `The MCP server at ${o.url} does not allow browser access (its CORS policy rejects the Authorization header). Connect to it in server mode.`,
            )
          }
          throw error
        })
      await response.body?.cancel().catch(() => {})
    },

    listTools(params, options) {
      return call<{ tools: MCPToolInfo[]; nextCursor?: string }>('tools/list', params ?? {}, options?.signal)
    },

    callTool(params, _resultSchema, options) {
      return call<MCPCallToolResult>('tools/call', params, options?.signal)
    },
  }
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function findResponse(payload: unknown, id: number): JSONRPCMessage | undefined {
  const messages = Array.isArray(payload) ? payload : [payload]
  return messages.find((m): m is JSONRPCMessage =>
    typeof m === 'object' && m !== null
    && (m as JSONRPCMessage).id === id
    && ('result' in m || 'error' in m))
}
