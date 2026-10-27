import type { Ref } from 'vue'
import type { ChatRequest, ChatStreamChunk, ChatStreamResult, LLMProvider } from '../providers/types'
import type { ChatStatus, UIMessage } from '../types'

/** A composable instance shown in the devtools inspector */
export interface DevtoolsSession {
  id: string
  kind: 'chat' | 'completion' | 'object'
  providerId: string
  getModel: () => string
  status: Ref<ChatStatus>
  error: Ref<Error | undefined>
  messages?: Ref<UIMessage[]>
  /** Current output of useCompletion / useObject */
  output?: Ref<unknown>
  stop: () => void
  clear?: () => void
}

export type DevtoolsEvent =
  | { type: 'session-added'; session: DevtoolsSession }
  | { type: 'session-removed'; sessionId: string }
  | {
    type: 'request-start'
    requestId: string
    sessionId: string
    providerId: string
    model: string
    messages: ChatRequest['messages']
    tools: string[]
    time: number
  }
  | { type: 'first-chunk'; requestId: string; sessionId: string; time: number }
  | { type: 'tool-call'; requestId: string; sessionId: string; toolCallId: string; toolName: string; args: string; time: number }
  | { type: 'tool-result'; requestId: string; sessionId: string; toolCallId: string; result?: unknown; error?: string; time: number }
  | {
    type: 'request-end'
    requestId: string
    sessionId: string
    finishReason?: string
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    /** Characters of text and reasoning received */
    textLength: number
    time: number
  }
  | { type: 'request-error'; requestId: string; sessionId: string; error: Error; aborted: boolean; time: number }

export interface DevtoolsBridge {
  emit(event: DevtoolsEvent): void
}

// A global slot, so duplicated copies of vue-llm in one app still reach the same devtools
const BRIDGE_KEY = Symbol.for('vue-llm.devtools')

type GlobalWithBridge = typeof globalThis & { [BRIDGE_KEY]?: DevtoolsBridge }

export function getDevtoolsBridge(): DevtoolsBridge | undefined {
  return (globalThis as GlobalWithBridge)[BRIDGE_KEY]
}

export function setDevtoolsBridge(bridge: DevtoolsBridge | undefined): void {
  (globalThis as GlobalWithBridge)[BRIDGE_KEY] = bridge
}

/** Registers a composable with devtools. Returns an unregister function. Free when devtools are not installed. */
export function registerDevtoolsSession(session: DevtoolsSession): () => void {
  const bridge = getDevtoolsBridge()
  if (!bridge) return () => {}
  bridge.emit({ type: 'session-added', session })
  return () => getDevtoolsBridge()?.emit({ type: 'session-removed', sessionId: session.id })
}

let requestCounter = 0

/**
 * Calls `provider.chat` and, when devtools are installed, reports the request and taps its stream.
 * Without devtools this is a plain `provider.chat` call.
 */
export async function tracedChat(provider: LLMProvider, request: ChatRequest, sessionId: string): Promise<ChatStreamResult> {
  const bridge = getDevtoolsBridge()
  if (!bridge) return provider.chat(request)

  const requestId = `${sessionId}:${++requestCounter}`
  const base = { requestId, sessionId }
  const now = () => Date.now()

  bridge.emit({
    type: 'request-start',
    ...base,
    providerId: provider.id,
    model: request.model,
    messages: request.messages,
    tools: request.tools?.map(t => t.name) ?? [],
    time: now(),
  })

  const fail = (error: unknown): void => {
    const err = error instanceof Error ? error : new Error(String(error))
    bridge.emit({ type: 'request-error', ...base, error: err, aborted: !!request.signal?.aborted, time: now() })
  }

  let result: ChatStreamResult
  try {
    result = await provider.chat(request)
  } catch (error) {
    fail(error)
    throw error
  }

  let started = false
  let ended = false
  let textLength = 0
  let finishReason: string | undefined
  let usage: Extract<ChatStreamChunk, { type: 'finish' }>['usage']
  const toolCalls = new Map<string, { name: string; args: string }>()

  const end = (): void => {
    if (ended) return
    ended = true
    bridge.emit({ type: 'request-end', ...base, finishReason, usage, textLength, time: now() })
  }

  const tap = new TransformStream<ChatStreamChunk, ChatStreamChunk>({
    transform(chunk, controller) {
      if (!started) {
        started = true
        bridge.emit({ type: 'first-chunk', ...base, time: now() })
      }

      switch (chunk.type) {
        case 'text-delta':
        case 'reasoning-delta':
          textLength += chunk.text.length
          break
        case 'tool-call-start':
          toolCalls.set(chunk.toolCallId, { name: chunk.toolName, args: '' })
          break
        case 'tool-call-delta': {
          const call = toolCalls.get(chunk.toolCallId)
          if (call) call.args += chunk.args
          break
        }
        case 'tool-call-end': {
          const call = toolCalls.get(chunk.toolCallId)
          bridge.emit({ type: 'tool-call', ...base, toolCallId: chunk.toolCallId, toolName: call?.name ?? '', args: call?.args ?? '', time: now() })
          break
        }
        case 'tool-result':
          bridge.emit({ type: 'tool-result', ...base, toolCallId: chunk.toolCallId, result: chunk.result, error: chunk.error, time: now() })
          break
        case 'finish':
          finishReason = chunk.finishReason
          usage = chunk.usage ?? usage
          break
        case 'error':
          ended = true
          fail(chunk.error)
          break
      }

      controller.enqueue(chunk)
    },
    flush: end,
  })

  // Usage may only arrive with the final response (e.g. OpenAI sends it after the finish chunk)
  result.response.then((response) => {
    usage = response.usage ?? usage
  }, () => {})

  const stream = result.stream.pipeThrough(tap)
  request.signal?.addEventListener('abort', () => {
    if (ended) return
    ended = true
    bridge.emit({ type: 'request-error', ...base, error: new Error('Aborted'), aborted: true, time: now() })
  }, { once: true })

  return { stream, response: result.response }
}
