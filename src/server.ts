import type { LLMProvider, ChatMessage, ChatStreamChunk } from './providers/types'
import type { ToolDefinition } from './types'
import { createAPIError } from './core/errors'

export interface LLMHandlerOptions {
  provider: LLMProvider
  model?: string
  system?: string
  tools?: ToolDefinition[]
  maxMessages?: number
  rateLimit?: ServerRateLimitOptions
  onRequest?: (body: LLMRequestBody) => LLMRequestBody | Promise<LLMRequestBody>
}

export interface ServerRateLimitOptions {
  maxRequests: number
  interval?: number
  key?: (request: Request) => string
}

export interface LLMRequestBody {
  messages: ChatMessage[]
  model?: string
  system?: string
}

export function createLLMHandler(options: LLMHandlerOptions) {
  const limiter = options.rateLimit ? createWindowLimiter(options.rateLimit) : undefined

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (limiter) {
      const retryAfter = limiter(request)
      if (retryAfter !== undefined) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(retryAfter / 1000)),
          },
        })
      }
    }

    let body: LLMRequestBody
    try {
      body = await request.json() as LLMRequestBody
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!body.messages?.length) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (options.maxMessages && body.messages.length > options.maxMessages) {
      body.messages = body.messages.slice(-options.maxMessages)
    }

    if (options.onRequest) {
      body = await options.onRequest(body)
    }

    const messages: ChatMessage[] = []
    const systemText = body.system ?? options.system
    if (systemText) {
      messages.push({ role: 'system', content: systemText })
    }
    messages.push(...body.messages)

    try {
      options.provider.validateConfig()

      const { stream } = await options.provider.chat({
        model: body.model ?? options.model ?? 'gpt-4o',
        messages,
        tools: options.tools,
        signal: request.signal,
      })

      const sseStream = streamToSSE(stream)

      return new Response(sseStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}

function createWindowLimiter(options: ServerRateLimitOptions): (request: Request) => number | undefined {
  const interval = options.interval ?? 60_000
  const getKey = options.key ?? defaultRateLimitKey
  const windows = new Map<string, { start: number; count: number }>()

  return (request) => {
    const now = Date.now()
    const key = getKey(request)

    if (windows.size > 10_000) {
      for (const [k, w] of windows) {
        if (now - w.start >= interval) windows.delete(k)
      }
    }

    let window = windows.get(key)
    if (!window || now - window.start >= interval) {
      window = { start: now, count: 0 }
      windows.set(key, window)
    }

    if (window.count >= options.maxRequests) {
      return window.start + interval - now
    }

    window.count++
    return undefined
  }
}

function defaultRateLimitKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0].trim()
    || request.headers.get('x-real-ip')
    || 'global'
}

export function streamToSSE(stream: ReadableStream<ChatStreamChunk>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return stream.pipeThrough(new TransformStream<ChatStreamChunk, Uint8Array>({
    transform(chunk, controller) {
      const data = serializeChunk(chunk)
      if (data) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    },
  }))
}

function serializeChunk(chunk: ChatStreamChunk): string | null {
  if (chunk.type === 'error') {
    return JSON.stringify({ type: 'error', message: chunk.error.message })
  }
  return JSON.stringify(chunk)
}

export function createProxyProvider(baseURL: string): LLMProvider {
  return {
    id: 'proxy',
    supportsStreaming: true,

    validateConfig() {},

    async chat(request) {
      const response = await fetch(baseURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: request.messages,
          model: request.model,
        }),
        signal: request.signal,
      })

      if (!response.ok) {
        throw await createAPIError('proxy', 'Proxy', response)
      }

      if (!response.body) {
        throw new Error('[vue-llm] No response body from proxy')
      }

      let resolveResponse: (value: import('./providers/types').ChatResponse) => void
      const responsePromise = new Promise<import('./providers/types').ChatResponse>(r => { resolveResponse = r })

      const stream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream<string, string>({
          buffer: '',
          transform(chunk, controller) {
            (this as unknown as { buffer: string }).buffer += chunk
            const lines = (this as unknown as { buffer: string }).buffer.split('\n')
            ;(this as unknown as { buffer: string }).buffer = lines.pop()!
            for (const line of lines) {
              const trimmed = line.trim()
              if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                controller.enqueue(trimmed.slice(6))
              }
            }
          },
          flush(controller) {
            const remaining = (this as unknown as { buffer: string }).buffer.trim()
            if (remaining.startsWith('data: ') && remaining !== 'data: [DONE]') {
              controller.enqueue(remaining.slice(6))
            }
          },
        } as Transformer<string, string>))
        .pipeThrough(new TransformStream<string, ChatStreamChunk>({
          transform(data, controller) {
            let parsed: ChatStreamChunk & { message?: string }
            try {
              parsed = JSON.parse(data)
            } catch {
              return
            }

            if (parsed.type === 'error') {
              controller.enqueue({
                type: 'error',
                error: new Error((parsed as { message?: string }).message ?? 'Unknown proxy error'),
              })
              return
            }

            if (parsed.type === 'finish') {
              resolveResponse!({
                finishReason: parsed.finishReason,
                usage: parsed.usage,
              })
            }

            controller.enqueue(parsed)
          },
        }))

      return { stream, response: responsePromise }
    },
  }
}
