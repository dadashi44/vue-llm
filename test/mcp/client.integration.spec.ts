// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMCPClient, mcpTools } from '../../src/mcp.js'
import { useChat } from '../../src/composables/use-chat.js'
import type { ChatStreamChunk, LLMProvider } from '../../src/providers/types.js'

function makeMcpServer(): McpServer {
  const server = new McpServer({ name: 'integration', version: '2.0.0' })
  server.registerTool('get_weather', {
    description: 'Current weather in a city',
    inputSchema: { city: z.string() },
  }, async ({ city }) => ({ content: [{ type: 'text', text: `Sunny in ${city}` }] }))
  server.registerTool('add', {
    description: 'Adds two numbers',
    inputSchema: { a: z.number(), b: z.number() },
  }, async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] }))
  return server
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of req) text += decoder.decode(chunk, { stream: true })
  text += decoder.decode()
  return text ? JSON.parse(text) : undefined
}

interface Running {
  url: string
  sessions: Map<string, StreamableHTTPServerTransport>
  deletes: number
}

let http: Server | undefined

afterEach(async () => {
  await new Promise<void>(resolve => (http ? http.close(() => resolve()) : resolve()))
  http = undefined
})

async function start(mode: 'stateful' | 'stateless', enableJsonResponse = false): Promise<Running> {
  const running: Running = { url: '', sessions: new Map(), deletes: 0 }

  http = createServer((req, res) => {
    void (async () => {
      const body = req.method === 'POST' ? await readBody(req) : undefined
      if (req.method === 'DELETE') running.deletes++

      if (mode === 'stateless') {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse })
        const server = makeMcpServer()
        res.on('close', () => {
          void transport.close()
          void server.close()
        })
        await server.connect(transport)
        await transport.handleRequest(req, res, body)
        return
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined
      let transport = sessionId ? running.sessions.get(sessionId) : undefined
      if (!transport) {
        if (sessionId) {
          res.writeHead(404).end('Session not found')
          return
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse,
          onsessioninitialized: (id) => {
            running.sessions.set(id, transport!)
          },
        })
        transport.onclose = () => {
          if (transport!.sessionId) running.sessions.delete(transport!.sessionId)
        }
        await makeMcpServer().connect(transport)
      }
      await transport.handleRequest(req, res, body)
    })().catch((error: unknown) => {
      res.writeHead(500).end(String(error))
    })
  })

  await new Promise<void>(resolve => http!.listen(0, '127.0.0.1', resolve))
  running.url = `http://127.0.0.1:${(http!.address() as { port: number }).port}/mcp`
  return running
}

const context = { toolCallId: 'call_1', signal: new AbortController().signal }

describe.each([
  ['stateful', 'stateful' as const, false],
  ['stateful with JSON responses', 'stateful' as const, true],
  ['stateless', 'stateless' as const, false],
])('createMCPClient against the SDK server (%s)', (_, mode, enableJsonResponse) => {
  it('connects, lists tools and calls them', async () => {
    const running = await start(mode, enableJsonResponse)
    const client = createMCPClient({ url: running.url, clientInfo: { name: 'vue-llm-test', version: '1.0.0' } })

    await expect(client.connect()).resolves.toEqual({
      status: 'ready',
      serverInfo: { name: 'integration', version: '2.0.0' },
      protocolVersion: '2025-06-18',
    })
    if (mode === 'stateful') expect(running.sessions.size).toBe(1)

    const tools = await mcpTools(client)
    expect(tools.map(t => t.name).sort()).toEqual(['add', 'get_weather'])

    const weather = tools.find(t => t.name === 'get_weather')!
    expect(weather.parameters).toMatchObject({ type: 'object', properties: { city: { type: 'string' } } })
    await expect(weather.execute({ city: 'Paris' }, context)).resolves.toBe('Sunny in Paris')
    await expect(tools.find(t => t.name === 'add')!.execute({ a: 2, b: 3 }, context)).resolves.toBe('5')

    await client.close()
    if (mode === 'stateful') {
      expect(running.deletes).toBe(1)
      expect(running.sessions.size).toBe(0)
    } else {
      expect(running.deletes).toBe(0)
    }
  })

  it('runs a tool end to end inside useChat', async () => {
    const running = await start(mode, enableJsonResponse)
    const client = createMCPClient({ url: running.url })
    await client.connect()

    const scripts: ChatStreamChunk[][] = [
      [
        { type: 'tool-call-start', toolCallId: 'call_1', toolName: 'get_weather' },
        { type: 'tool-call-delta', toolCallId: 'call_1', args: '{"city":"Oslo"}' },
        { type: 'tool-call-end', toolCallId: 'call_1' },
        { type: 'finish', finishReason: 'tool-calls' },
      ],
      [{ type: 'text-delta', text: 'Sunny.' }, { type: 'finish', finishReason: 'stop' }],
    ]
    const provider: LLMProvider = {
      id: 'mock',
      supportsStreaming: true,
      validateConfig: () => {},
      chat: async () => {
        const chunks = scripts.shift()!
        return {
          stream: new ReadableStream<ChatStreamChunk>({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk)
              controller.close()
            },
          }),
          response: Promise.resolve({ finishReason: 'stop' as const }),
        }
      },
    }

    const { messages, sendMessage } = useChat({ provider, model: 'm', tools: await mcpTools(client) })
    await sendMessage('Weather in Oslo?')

    const parts = messages.value.flatMap(m => m.parts)
    expect(parts.find(p => p.type === 'tool-call')).toMatchObject({ state: 'result', result: 'Sunny in Oslo' })
    expect(parts.at(-1)).toMatchObject({ type: 'text', text: 'Sunny.' })
    await client.close()
  })
})
