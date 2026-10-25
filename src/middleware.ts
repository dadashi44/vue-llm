import type { ChatRequest, ChatStreamResult, ChatStreamChunk, LLMProvider } from './providers/types'
import { LLMAPIError } from './core/errors'

export type ChatHandler = (request: ChatRequest) => Promise<ChatStreamResult>

export interface Middleware {
  wrapChat?: (next: ChatHandler, request: ChatRequest) => Promise<ChatStreamResult>
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

      const handler = middlewares.reduceRight<ChatHandler>(
        (next, mw) => mw.wrapChat ? req => mw.wrapChat!(next, req) : next,
        req => provider.chat(req),
      )

      let result: ChatStreamResult
      try {
        result = await handler(currentRequest)
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

export interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  factor?: number
  jitter?: boolean
  shouldRetry?: (error: Error, attempt: number) => boolean
  onRetry?: (info: { error: Error; attempt: number; delay: number }) => void
}

export function retryMiddleware(options: RetryOptions | number = {}, legacyDelay?: number): Middleware {
  const opts: RetryOptions = typeof options === 'number'
    ? { maxRetries: options, initialDelay: legacyDelay }
    : options

  const maxRetries = opts.maxRetries ?? 3
  const initialDelay = opts.initialDelay ?? 1000
  const maxDelay = opts.maxDelay ?? 30_000
  const factor = opts.factor ?? 2
  const jitter = opts.jitter ?? true
  const shouldRetry = opts.shouldRetry ?? isRetryableError

  return {
    async wrapChat(next, request) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await next(request)
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          if (attempt > maxRetries || request.signal?.aborted || !shouldRetry(error, attempt)) {
            throw error
          }

          const backoff = initialDelay * factor ** (attempt - 1)
          const retryAfter = error instanceof LLMAPIError ? error.retryAfter : undefined
          const delay = Math.min(
            maxDelay,
            retryAfter ?? (jitter ? backoff * (0.5 + Math.random() * 0.5) : backoff),
          )

          opts.onRetry?.({ error, attempt, delay })
          await sleep(delay, request.signal)
        }
      }
    },
  }
}

export function isRetryableError(error: Error): boolean {
  if (error.name === 'AbortError') return false
  if (error instanceof LLMAPIError) return error.isRetryable
  return error instanceof TypeError
}

export interface RateLimitOptions {
  maxRequests?: number
  interval?: number
  maxConcurrent?: number
}

export function rateLimitMiddleware(options: RateLimitOptions): Middleware {
  const interval = options.interval ?? 60_000
  const starts: number[] = []
  let active = 0
  const listeners = new Set<() => void>()

  const release = (): void => {
    active--
    for (const notify of [...listeners]) notify()
  }

  const acquire = async (signal?: AbortSignal): Promise<void> => {
    while (true) {
      signal?.throwIfAborted()
      const now = Date.now()
      while (starts.length > 0 && starts[0] <= now - interval) starts.shift()

      const windowFull = options.maxRequests !== undefined && starts.length >= options.maxRequests
      const concurrencyFull = options.maxConcurrent !== undefined && active >= options.maxConcurrent

      if (!windowFull && !concurrencyFull) {
        starts.push(now)
        active++
        return
      }

      await new Promise<void>((resolve, reject) => {
        const done = (): void => {
          clearTimeout(timer)
          listeners.delete(done)
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }
        const onAbort = (): void => {
          done()
          reject(signal!.reason)
        }
        const timer = windowFull ? setTimeout(done, starts[0] + interval - now) : undefined
        listeners.add(done)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }

  return {
    async wrapChat(next, request) {
      await acquire(request.signal)

      let result: ChatStreamResult
      try {
        result = await next(request)
      } catch (err) {
        release()
        throw err
      }

      return { ...result, stream: onStreamEnd(result.stream, release) }
    },
  }
}

function onStreamEnd<T>(stream: ReadableStream<T>, callback: () => void): ReadableStream<T> {
  const reader = stream.getReader()
  let finished = false
  const finish = (): void => {
    if (finished) return
    finished = true
    callback()
  }

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          finish()
          controller.close()
        } else {
          controller.enqueue(value)
        }
      } catch (err) {
        finish()
        controller.error(err)
      }
    },
    cancel(reason) {
      finish()
      return reader.cancel(reason)
    },
  })
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal!.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
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
