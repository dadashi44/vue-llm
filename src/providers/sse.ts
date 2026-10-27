import type { ChatRequest, ChatResponse, ChatStreamChunk, ChatStreamResult, LLMProvider } from './types'
import { SSEParserStream, type SSEEvent } from '../core/sse-parser'
import { createAPIError } from '../core/errors'

type MaybePromise<T> = T | Promise<T>

export interface SSEProviderEvent extends SSEEvent {
  json: unknown
}

export interface SSEProviderConfig {
  url: string | ((request: ChatRequest) => string)
  id?: string
  name?: string
  method?: string
  headers?: HeadersInit | (() => MaybePromise<HeadersInit>)
  credentials?: RequestCredentials
  body?: (request: ChatRequest) => unknown
  mapEvent?: (event: SSEProviderEvent) => ChatStreamChunk | ChatStreamChunk[] | null | undefined
}

export function createSSEProvider(config: SSEProviderConfig): LLMProvider {
  const id = config.id ?? 'sse'
  const mapEvent = config.mapEvent ?? defaultMapEvent

  return {
    id,
    supportsStreaming: true,

    validateConfig() {},

    async chat(request: ChatRequest): Promise<ChatStreamResult> {
      const url = typeof config.url === 'function' ? config.url(request) : config.url
      const headers = new Headers(typeof config.headers === 'function' ? await config.headers() : config.headers)
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
      if (!headers.has('Accept')) headers.set('Accept', 'text/event-stream')

      const response = await fetch(url, {
        method: config.method ?? 'POST',
        headers,
        credentials: config.credentials,
        body: JSON.stringify(config.body ? config.body(request) : { messages: request.messages, model: request.model }),
        signal: request.signal,
      })

      if (!response.ok) {
        throw await createAPIError(id, config.name ?? 'SSE backend', response)
      }

      if (!response.body) {
        throw new Error('[vue-llm] No response body from SSE backend')
      }

      let resolveResponse: (value: ChatResponse) => void
      const responsePromise = new Promise<ChatResponse>(r => { resolveResponse = r })
      let finished = false

      const stream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new SSEParserStream())
        .pipeThrough(new TransformStream<SSEEvent, ChatStreamChunk>({
          transform(event, controller) {
            if (event.data === '[DONE]') return

            let json: unknown
            try {
              json = JSON.parse(event.data)
            } catch {
              json = undefined
            }

            const mapped = mapEvent({ ...event, json })
            if (!mapped) return

            for (const chunk of Array.isArray(mapped) ? mapped : [mapped]) {
              if (chunk.type === 'finish' && !finished) {
                finished = true
                resolveResponse!({ finishReason: chunk.finishReason, usage: chunk.usage })
              }
              controller.enqueue(chunk)
            }
          },
          flush(controller) {
            if (!finished) {
              finished = true
              controller.enqueue({ type: 'finish', finishReason: 'stop' })
              resolveResponse!({ finishReason: 'stop' })
            }
          },
        }))

      return { stream, response: responsePromise }
    },
  }
}

function defaultMapEvent(event: SSEProviderEvent): ChatStreamChunk | null {
  const chunk = event.json as (ChatStreamChunk & { message?: string }) | undefined
  if (!chunk || typeof chunk !== 'object' || typeof chunk.type !== 'string') return null
  if (chunk.type === 'error') {
    return { type: 'error', error: new Error(chunk.message ?? 'Unknown backend error') }
  }
  return chunk
}
