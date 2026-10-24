import type { FinishReason, ToolDefinition, Usage } from '../types'

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
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[]
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; mediaType?: string }

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
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call-start'; toolCallId: string; toolName: string }
  | { type: 'tool-call-delta'; toolCallId: string; args: string }
  | { type: 'tool-call-end'; toolCallId: string }
  | { type: 'finish'; finishReason: FinishReason; usage?: Usage }
  | { type: 'error'; error: Error }
