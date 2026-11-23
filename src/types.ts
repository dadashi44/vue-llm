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
  | DataPart

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
  /** While `state` is `'streaming'` this holds the arguments parsed so far */
  args: unknown
  /**
   * - `streaming`: arguments are still arriving
   * - `pending`: arguments are complete, waiting for a result (e.g. from the user via `addToolResult`)
   * - `running`: `execute` / `onToolCall` is in progress
   * - `result` / `error`: resolved
   */
  state: ToolCallState
  result?: unknown
  error?: string
}

export type ToolCallState = 'streaming' | 'pending' | 'running' | 'result' | 'error'

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

/**
 * Custom data shown in the answer, such as a chart, a table or progress. Not sent to the model.
 * A later `data` chunk with the same `name` and `id` replaces `data` in place.
 */
export interface DataPart<Data = unknown> {
  type: 'data'
  name: string
  data: Data
  id?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

// Tool arguments default to `any` so tools with typed arguments fit in one `ChatTool[]`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = any

export interface ToolExecutionContext {
  toolCallId: string
  /** Aborted when the chat is stopped */
  signal: AbortSignal
}

/** A tool for `useChat`. Without `execute`, the call waits for `onToolCall` or `addToolResult`. */
export interface ChatTool<Args = AnyArgs, Result = unknown> extends ToolDefinition {
  execute?: (args: Args, context: ToolExecutionContext) => Result | Promise<Result>
}

/** Identity helper that types `execute` arguments and results */
export function defineTool<Args = AnyArgs, Result = unknown>(tool: ChatTool<Args, Result>): ChatTool<Args, Result> {
  return tool
}

export type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

/** Props passed to a component rendering a tool call (Generative UI) */
export interface ToolComponentProps<Args = AnyArgs, Result = AnyArgs> {
  toolCallId: string
  toolName: string
  /** Partial while `state` is `'streaming'`, complete afterwards */
  args: DeepPartial<Args> | undefined
  state: ToolCallState
  result: Result | undefined
  error: string | undefined
  /** Resolve the call from the UI (human-in-the-loop) */
  addResult: (result: Result) => void
}

/** Props passed to a component rendering a data part, see `dataComponents` */
export interface DataComponentProps<Data = AnyArgs> {
  name: string
  data: Data
}

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export type FinishReason = 'stop' | 'length' | 'tool-calls' | 'error'

export interface Usage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
