import { describe, it, expect, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { mcpTools } from '../src/mcp'
import type { MCPClient } from '../src/mcp'
import { createLLMHandler } from '../src/server'
import { useChat } from '../src/composables/use-chat'
import type { LLMProvider, ChatStreamChunk } from '../src/providers/types'

interface FakeTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  run: (args: Record<string, unknown>) => Record<string, unknown>
}

/** A real MCP server and client from the official SDK, connected in memory */
async function connect(tools: FakeTool[], pageSize = 100): Promise<Client> {
  const server = new Server({ name: 'test', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const start = Number(request.params?.cursor ?? 0)
    const page = tools.slice(start, start + pageSize)
    return {
      tools: page.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema: inputSchema ?? { type: 'object', properties: {} },
      })),
      nextCursor: start + pageSize < tools.length ? String(start + pageSize) : undefined,
    }
  })
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name)!
    return tool.run(request.params.arguments ?? {}) as never
  })

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'vue-llm-test', version: '1.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

const weather: FakeTool = {
  name: 'get_weather',
  description: 'Current weather in a city',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  run: args => ({ content: [{ type: 'text', text: `Sunny in ${String(args.city)}` }] }),
}

const context = { toolCallId: 'call_1', signal: new AbortController().signal }

describe('mcpTools', () => {
  it('turns MCP tools into chat tools with their JSON schema', async () => {
    const tools = await mcpTools(await connect([weather]))

    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      name: 'get_weather',
      description: 'Current weather in a city',
      parameters: weather.inputSchema,
    })
  })

  it('calls the MCP tool and returns its text', async () => {
    const [tool] = await mcpTools(await connect([weather]))

    await expect(tool.execute({ city: 'Paris' }, context)).resolves.toBe('Sunny in Paris')
  })

  it('prefers structured content and keeps non-text content as is', async () => {
    const image = { type: 'image', data: 'aGk=', mimeType: 'image/png' }
    const [structured, mixed] = await mcpTools(await connect([
      { name: 'structured', run: () => ({ content: [{ type: 'text', text: '{"t":21}' }], structuredContent: { t: 21 } }) },
      { name: 'mixed', run: () => ({ content: [{ type: 'text', text: 'chart' }, image] }) },
    ]))

    await expect(structured.execute({}, context)).resolves.toEqual({ t: 21 })
    await expect(mixed.execute({}, context)).resolves.toEqual([{ type: 'text', text: 'chart' }, image])
  })

  it('throws the tool error so the chat records it as a failed call', async () => {
    const [tool] = await mcpTools(await connect([
      { name: 'fail', run: () => ({ isError: true, content: [{ type: 'text', text: 'City not found' }] }) },
    ]))

    await expect(tool.execute({}, context)).rejects.toThrow('City not found')
  })

  it('reads every page of the tool list', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...weather, name: `tool_${i}` }))
    const tools = await mcpTools(await connect(many, 2))

    expect(tools.map(t => t.name)).toEqual(['tool_0', 'tool_1', 'tool_2', 'tool_3', 'tool_4'])
  })

  it('filters tools and prefixes names, calling the original name', async () => {
    const client = await connect([weather, { ...weather, name: 'delete.everything' }])
    const callTool = vi.spyOn(client, 'callTool')

    const tools = await mcpTools(client, { include: ['get_weather'], prefix: 'meteo' })
    expect(tools.map(t => t.name)).toEqual(['meteo_get_weather'])

    await tools[0].execute({ city: 'Oslo' }, context)
    expect(callTool.mock.calls[0][0]).toEqual({ name: 'get_weather', arguments: { city: 'Oslo' } })

    const excluded = await mcpTools(client, { exclude: ['delete.everything'] })
    expect(excluded.map(t => t.name)).toEqual(['get_weather'])
  })

  it('replaces characters providers reject in tool names', async () => {
    const tools = await mcpTools(await connect([{ ...weather, name: 'files.read file' }]))

    expect(tools[0].name).toBe('files_read_file')
  })

  it('passes the abort signal to the MCP call', async () => {
    const client: MCPClient = {
      listTools: async () => ({ tools: [{ name: 'slow', inputSchema: { type: 'object' } }] }),
      callTool: vi.fn(async () => ({ content: [] })),
    }
    const [tool] = await mcpTools(client)
    const controller = new AbortController()

    await tool.execute({}, { toolCallId: 'call_1', signal: controller.signal })
    expect(vi.mocked(client.callTool).mock.calls[0][2]).toEqual({ signal: controller.signal })
  })

  it('runs MCP tools inside useChat', async () => {
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

    const { messages, sendMessage } = useChat({ provider, model: 'm', tools: await mcpTools(await connect([weather])) })
    await sendMessage('Weather in Oslo?')

    const parts = messages.value.flatMap(m => m.parts)
    expect(parts.find(p => p.type === 'tool-call')).toMatchObject({ state: 'result', result: 'Sunny in Oslo' })
    expect(parts.at(-1)).toMatchObject({ type: 'text', text: 'Sunny.' })
  })

  it('runs MCP tools inside createLLMHandler', async () => {
    const turns: ChatStreamChunk[][] = [
      [
        { type: 'tool-call-start', toolCallId: 'call_1', toolName: 'get_weather' },
        { type: 'tool-call-delta', toolCallId: 'call_1', args: '{"city":"Rome"}' },
        { type: 'finish', finishReason: 'tool-calls' },
      ],
      [{ type: 'text-delta', text: 'It is sunny.' }, { type: 'finish', finishReason: 'stop' }],
    ]
    const provider: LLMProvider = {
      id: 'mock',
      supportsStreaming: true,
      validateConfig: () => {},
      chat: vi.fn(async () => {
        const chunks = turns.shift()!
        return {
          stream: new ReadableStream<ChatStreamChunk>({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk)
              controller.close()
            },
          }),
          response: Promise.resolve({ finishReason: 'stop' as const }),
        }
      }),
    }

    const handler = createLLMHandler({ provider, tools: await mcpTools(await connect([weather])) })
    const response = await handler(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Weather in Rome?' }] }),
    }))
    const body = await response.text()

    expect(body).toContain('"type":"tool-result"')
    expect(body).toContain('Sunny in Rome')
    expect(body).toContain('It is sunny.')
  })
})
