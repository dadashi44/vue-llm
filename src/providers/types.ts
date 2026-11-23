import type { FinishReason, ToolDefinition, Usage } from '../types.js'

export interface LLMProvider {
  readonly id: string
  readonly supportsStreaming: boolean
  chat(options: ChatRequest): Promise<ChatStreamResult>
  validateConfig(): void
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  signal?: AbortSignal
  providerOptions?: Record<string, unknown>
  /**
   * Why the request is sent: a new user message (`submit`), `regenerate`, or tool results
   * sent back to the model (`continue`). Lets backends that store history act on it.
   */
  trigger?: ChatTrigger
  /** `submit`: id of the new user message. `regenerate`: id of the assistant message being replaced. */
  messageId?: string
}

export type ChatTrigger = 'submit' | 'regenerate' | 'continue'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[]
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; mediaType?: string }
  | { type: 'file'; url: string; mediaType: string; filename?: string }

export interface ToolCall {
  id: string
  name: string
  args: unknown
}

export interface ChatStreamResult {
  stream: ReadableStream<ChatStreamChunk>
  response: Promise<ChatResponse>
}

export interface ChatResponse {
  finishReason: FinishReason
  usage?: Usage
}

export type ChatStreamChunk =
  /** Sets the id of the assistant message, e.g. to the id in the backend's database */
  | { type: 'message-start'; id: string }
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call-start'; toolCallId: string; toolName: string }
  | { type: 'tool-call-delta'; toolCallId: string; args: string }
  | { type: 'tool-call-end'; toolCallId: string }
  | { type: 'tool-result'; toolCallId: string; result?: unknown; error?: string }
  /** Adds a data part to the answer, or replaces the data of the part with the same `name` and `id` */
  | { type: 'data'; name: string; data: unknown; id?: string }
  /** Merged into `metadata` of the assistant message; later keys replace earlier ones */
  | { type: 'message-metadata'; metadata: Record<string, unknown> }
  | { type: 'finish'; finishReason: FinishReason; usage?: Usage }
  | { type: 'error'; error: Error }
