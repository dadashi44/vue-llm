import type { ChatRequest, ChatStreamResult, ChatStreamChunk, LLMProvider } from './providers/types'

export interface Middleware {
  beforeRequest?: (request: ChatRequest, provider: LLMProvider) => ChatRequest | Promise<ChatRequest>
  afterStream?: (chunk: ChatStreamChunk, request: ChatRequest) => ChatStreamChunk | null | Promise<ChatStreamChunk | null>
  onError?: (error: Error, request: ChatRequest) => Error | void | Promise<Error | void>
  onFinish?: (request: ChatRequest, response: ChatStreamResult) => void | Promise<void>
}

export function wrapProvider(provider: LLMProvider, middlewares: Middleware[]): LLMProvider {
  if (!middlewares.length) return provider

  return {
    id: provider.id,
    supportsStreaming: provider.supportsStreaming,

    validateConfig() {
      provider.validateConfig()
    },

    async chat(request: ChatRequest): Promise<ChatStreamResult> {
      let currentRequest = request

      for (const mw of middlewares) {
        if (mw.beforeRequest) {
          currentRequest = await mw.beforeRequest(currentRequest, provider)
        }
      }

      let result: ChatStreamResult
      try {
        result = await provider.chat(currentRequest)
      } catch (err) {
        let error = err instanceof Error ? err : new Error(String(err))
        for (const mw of middlewares) {
          if (mw.onError) {
            const replaced = await mw.onError(error, currentRequest)
            if (replaced instanceof Error) error = replaced
          }
        }
        throw error
      }

      const hasAfterStream = middlewares.some(mw => mw.afterStream)

      const stream = hasAfterStream
        ? result.stream.pipeThrough(new TransformStream<ChatStreamChunk, ChatStreamChunk>({
          async transform(chunk, controller) {
            let current: ChatStreamChunk | null = chunk
            for (const mw of middlewares) {
              if (!current) break
              if (mw.afterStream) {
                current = await mw.afterStream(current, currentRequest)
              }
            }
            if (current) controller.enqueue(current)
          },
        }))
        : result.stream

      for (const mw of middlewares) {
        if (mw.onFinish) {
          mw.onFinish(currentRequest, result)
        }
      }

      return { stream, response: result.response }
    },
  }
}

export function loggingMiddleware(label = 'vue-llm'): Middleware {
  return {
    beforeRequest(request) {
      console.log(`[${label}] → ${request.model}`, request.messages.length, 'messages')
      return request
    },
    afterStream(chunk) {
      if (chunk.type === 'finish') {
        console.log(`[${label}] ← finish:`, chunk.finishReason, chunk.usage ?? '')
      }
      return chunk
    },
    onError(error) {
      console.error(`[${label}] error:`, error.message)
    },
  }
}

export function retryMiddleware(maxRetries = 3, delay = 1000): Middleware {
  return {
    async onError(error, _request) {
      const msg = error.message
      const isRetryable = msg.includes('429') || msg.includes('500') || msg.includes('502') || msg.includes('503')

      if (!isRetryable) return error

      for (let i = 0; i < maxRetries; i++) {
        await new Promise(r => setTimeout(r, delay * (i + 1)))
        console.log(`[vue-llm] retry ${i + 1}/${maxRetries}`)
      }

      return error
    },
  }
}

export function headerMiddleware(headers: Record<string, string>): Middleware {
  return {
    beforeRequest(request) {
      return {
        ...request,
        providerOptions: {
          ...request.providerOptions,
          headers: { ...(request.providerOptions?.headers as Record<string, string>), ...headers },
        },
      }
    },
  }
}
