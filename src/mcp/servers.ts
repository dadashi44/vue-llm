/** A known remote MCP server, for `useMCPServers({ catalog })` and `createMCPConnector({ servers })` */
export interface MCPServerPreset {
  /** Stable id; also the prefix of the server's tools (`notion_search`) */
  id: string
  name: string
  /** The Streamable HTTP endpoint */
  url: string
  /** Where the server was verified to work: straight from the browser and/or through the backend */
  modes: ('browser' | 'server')[]
  /** A pre-registered OAuth client, for servers without dynamic client registration (server mode) */
  oauth?: { clientId: string; clientSecret: string; scopes?: string[] }
}

/**
 * MCP servers verified with vue-llm. Any other URL works too; these only save typing.
 * `github` needs server mode and an OAuth app: `{ ...mcpServers.github, oauth: { clientId, clientSecret } }`.
 */
export const mcpServers: Record<'notion' | 'linear' | 'huggingface' | 'deepwiki' | 'github', MCPServerPreset> = {
  notion: { id: 'notion', name: 'Notion', url: 'https://mcp.notion.com/mcp', modes: ['browser', 'server'] },
  linear: { id: 'linear', name: 'Linear', url: 'https://mcp.linear.app/mcp', modes: ['browser', 'server'] },
  huggingface: { id: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/mcp', modes: ['browser', 'server'] },
  deepwiki: { id: 'deepwiki', name: 'DeepWiki', url: 'https://mcp.deepwiki.com/mcp', modes: ['browser', 'server'] },
  github: { id: 'github', name: 'GitHub', url: 'https://api.githubcopilot.com/mcp/', modes: ['server'] },
}
