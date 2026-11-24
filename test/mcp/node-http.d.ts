// Minimal typings for the `node:http` server used by the MCP integration tests
// (the project does not depend on @types/node).
declare module 'node:http' {
  interface IncomingMessage extends AsyncIterable<Uint8Array> {
    method?: string
    url?: string
    headers: Record<string, string | string[] | undefined>
  }
  interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string>): ServerResponse
    end(body?: string): void
    on(event: 'close', listener: () => void): ServerResponse
  }
  interface Server {
    listen(port: number, host: string, callback: () => void): Server
    close(callback?: () => void): Server
    closeAllConnections(): void
    address(): unknown
  }
  function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server
}
