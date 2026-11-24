import type { ToolCallState, UIMessage, UIMessagePart } from '../types.js'

/**
 * Message shapes of the Vercel AI SDK (`ai` package, v5+), declared here so they type-check
 * without installing `ai`. Nuxt UI's chat components and their examples use these shapes.
 */
export type AISDKUIPart =
  | { type: 'text'; text: string; state?: 'streaming' | 'done' }
  | { type: 'reasoning'; text: string; state?: 'streaming' | 'done' }
  | { type: 'file'; mediaType: string; url: string; filename?: string }
  | { type: 'source-url'; sourceId: string; url: string; title?: string }
  | {
    type: `tool-${string}`
    toolCallId: string
    state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
    input: unknown
    output?: unknown
    errorText?: string
  }
  | { type: `data-${string}`; id?: string; data: unknown }

export interface AISDKUIMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: AISDKUIPart[]
  metadata?: Record<string, unknown>
}

const TOOL_STATES: Record<ToolCallState, 'input-streaming' | 'input-available' | 'output-available' | 'output-error'> = {
  streaming: 'input-streaming',
  pending: 'input-available',
  running: 'input-available',
  result: 'output-available',
  error: 'output-error',
}

function toPart(part: UIMessagePart): AISDKUIPart {
  switch (part.type) {
    case 'tool-call': {
      const tool: AISDKUIPart = {
        type: `tool-${part.toolName}`,
        toolCallId: part.toolCallId,
        state: TOOL_STATES[part.state],
        input: part.args,
      }
      if (part.result !== undefined) tool.output = part.result
      if (part.error !== undefined) tool.errorText = part.error
      return tool
    }
    case 'source': {
      const source: AISDKUIPart = { type: 'source-url', sourceId: part.url, url: part.url }
      if (part.title !== undefined) source.title = part.title
      return source
    }
    case 'data': {
      const data: AISDKUIPart = { type: `data-${part.name}`, data: part.data }
      if (part.id !== undefined) data.id = part.id
      return data
    }
    default:
      return part
  }
}

/**
 * Converts vue-llm messages to the Vercel AI SDK message shape, for UI kits built on it such as
 * Nuxt UI's chat components: `computed(() => toUIMessages(chat.messages.value))`.
 * Text, reasoning and file parts are the same in both; tool calls become `tool-<name>` parts,
 * sources `source-url` parts and data parts `data-<name>` parts. The input is not modified.
 */
export function toUIMessages(messages: readonly UIMessage[]): AISDKUIMessage[] {
  return messages.map((message) => {
    const converted: AISDKUIMessage = { id: message.id, role: message.role, parts: message.parts.map(toPart) }
    if (message.metadata !== undefined) converted.metadata = message.metadata
    return converted
  })
}
