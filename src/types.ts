export interface UIMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: UIMessagePart[]
  metadata?: Record<string, unknown>
  createdAt?: Date
}

export type UIMessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | FilePart
  | SourcePart

export interface TextPart {
  type: 'text'
  text: string
  state?: 'streaming' | 'done'
}

export interface ReasoningPart {
  type: 'reasoning'
  text: string
  state?: 'streaming' | 'done'
}

export interface ToolCallPart {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: unknown
  state: 'pending' | 'running' | 'result' | 'error'
  result?: unknown
  error?: string
}

export interface FilePart {
  type: 'file'
  mediaType: string
  url: string
  filename?: string
}

export interface SourcePart {
  type: 'source'
  url: string
  title?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export type FinishReason = 'stop' | 'length' | 'tool-calls' | 'error'

export interface Usage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
