/**
 * Model Context Protocol tools for vue-llm.
 *
 * Takes a connected client from the official `@modelcontextprotocol/sdk` (any transport:
 * Streamable HTTP, SSE, stdio) and turns the tools of its server into tools for `useChat`
 * and `createLLMHandler`. vue-llm does not depend on the SDK; any object with the same
 * `listTools` and `callTool` methods works.
 */

/** A tool as listed by an MCP server */
export interface MCPToolInfo {
  name: string
  title?: string
  description?: string
  inputSchema: Record<string, unknown>
}

/** Result of an MCP `tools/call` request */
export interface MCPCallToolResult {
  content?: unknown[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
  /** Result field of servers on protocol version 2024-10-07 */
  toolResult?: unknown
}

/** The part of the MCP SDK `Client` that vue-llm uses */
export interface MCPClient {
  listTools(
    params?: { cursor?: string },
    options?: { signal?: AbortSignal },
  ): Promise<{ tools: MCPToolInfo[]; nextCursor?: string }>
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: undefined,
    options?: { signal?: AbortSignal },
  ): Promise<MCPCallToolResult>
}

export interface MCPToolsOptions {
  /** Only these tools, by their name on the MCP server */
  include?: string[]
  /** Leave out these tools, by their name on the MCP server */
  exclude?: string[]
  /** Added before each name as `prefix_name`, to tell apart tools of several servers */
  prefix?: string
  /** Cancels listing the tools */
  signal?: AbortSignal
}

/** Context passed by `useChat` (with `signal`) and by `createLLMHandler` (with `request`) */
export interface MCPToolContext {
  toolCallId: string
  signal?: AbortSignal
  request?: Request
}

/** A tool that works in `useChat({ tools })` and in `createLLMHandler({ tools })` */
export interface MCPTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: unknown, context: MCPToolContext) => Promise<unknown>
}

/** Tool names that every provider accepts */
function toToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
}

function toResult(result: MCPCallToolResult): unknown {
  if ('toolResult' in result && !('content' in result)) return result.toolResult

  const content = result.content ?? []
  const texts = content.every(isTextContent) ? content.map(part => part.text) : undefined

  if (result.isError) {
    throw new Error(texts?.join('\n') || 'MCP tool call failed')
  }
  if (result.structuredContent !== undefined) return result.structuredContent
  return texts ? texts.join('\n') : content
}

function isTextContent(part: unknown): part is { type: 'text'; text: string } {
  return typeof part === 'object' && part !== null
    && (part as { type?: unknown }).type === 'text'
    && typeof (part as { text?: unknown }).text === 'string'
}

/**
 * Lists the tools of a connected MCP client and wraps each one as a vue-llm tool.
 *
 * ```ts
 * import { Client } from '@modelcontextprotocol/sdk/client/index.js'
 * import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
 * import { mcpTools } from 'vue-llm/mcp'
 *
 * const client = new Client({ name: 'my-app', version: '1.0.0' })
 * await client.connect(new StreamableHTTPClientTransport(new URL('https://example.com/mcp')))
 *
 * createLLMHandler({ provider, tools: await mcpTools(client) })
 * ```
 */
export async function mcpTools(client: MCPClient, options: MCPToolsOptions = {}): Promise<MCPTool[]> {
  const listed: MCPToolInfo[] = []
  let cursor: string | undefined
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined, { signal: options.signal })
    listed.push(...page.tools)
    cursor = page.nextCursor
  } while (cursor)

  return listed
    .filter(tool => !options.include || options.include.includes(tool.name))
    .filter(tool => !options.exclude?.includes(tool.name))
    .map((tool): MCPTool => ({
      name: toToolName(options.prefix ? `${options.prefix}_${tool.name}` : tool.name),
      description: tool.description ?? tool.title ?? '',
      parameters: tool.inputSchema,
      async execute(args, context) {
        const result = await client.callTool(
          { name: tool.name, arguments: (args ?? {}) as Record<string, unknown> },
          undefined,
          { signal: context?.signal ?? context?.request?.signal },
        )
        return toResult(result)
      },
    }))
}
