/**
 * `vue-llm/mcp`: Model Context Protocol tools, a dependency-free Streamable HTTP client
 * and the OAuth pieces used to connect to MCP servers.
 */
export { mcpTools } from './mcp/tools.js'
export type {
  MCPClient,
  MCPTool,
  MCPToolInfo,
  MCPCallToolResult,
  MCPToolsOptions,
  MCPToolContext,
} from './mcp/tools.js'

export { createMCPClient } from './mcp/client.js'
export type { MCPHttpClient, MCPConnectResult } from './mcp/client.js'

export { MCPHTTPError, MCPUnsupportedServerError, MCPAuthError, MCPProtocolError } from './mcp/errors.js'

export { resolveMCPStorage } from './mcp/storage.js'
export type { MCPAuthStorage, MCPStorageOption } from './mcp/storage.js'

export { createMCPAuth } from './mcp/auth.js'
export type { MCPAuth } from './mcp/auth.js'
export type { MCPAuthChallenge } from './mcp/oauth.js'

export { handleMCPCallback } from './mcp/callback.js'
export type { MCPCallbackMessage } from './mcp/callback.js'

export { mcpServers } from './mcp/servers.js'
export type { MCPServerPreset } from './mcp/servers.js'
