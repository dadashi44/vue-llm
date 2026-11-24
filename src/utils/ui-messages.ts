import type { ToolCallState, UIMessage, UIMessagePart } from '../types.js'

/**
 * Message shapes of the Vercel AI SDK (`ai` package, v5–v7), declared here so they type-check
 * without installing `ai` and are assignable to its `UIMessage` when it is installed.
 * Nuxt UI's chat components and their examples use these shapes.
 */
interface AISDKToolBase {
  type: `tool-${string}`
  toolCallId: string
  input: unknown
}

/** Like the AI SDK, one variant per state: `output` only when available, `errorText` only on error */
export type AISDKToolPart =
  | (AISDKToolBase & { state: 'input-streaming' | 'input-available' })
  | (AISDKToolBase & { state: 'output-available'; output: unknown })
  | (AISDKToolBase & { state: 'output-error'; errorText: string })

export type AISDKUIPart =
  | { type: 'text'; text: string; state?: 'streaming' | 'done' }
  | { type: 'reasoning'; text: string; state?: 'streaming' | 'done' }
  | { type: 'file'; mediaType: string; url: string; filename?: string }
  | { type: 'source-url'; sourceId: string; url: string; title?: string }
  | AISDKToolPart
  | { type: `data-${string}`; id?: string; data: unknown }

export interface AISDKUIMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: AISDKUIPart[]
  metadata?: Record<string, unknown>
}

/**
 * Tool calls become `tool-<name>` parts, the static-tool form that Nuxt UI's examples branch on
 * (AI SDK's `dynamic-tool` form would also need `toolName`, which those examples don't read).
 */
function toToolPart(part: Extract<UIMessagePart, { type: 'tool-call' }>): AISDKToolPart {
  const base: AISDKToolBase = { type: `tool-${part.toolName}`, toolCallId: part.toolCallId, input: part.args }
  switch (part.state as ToolCallState) {
    case 'streaming':
      return { ...base, state: 'input-streaming' }
    case 'result':
      return { ...base, state: 'output-available', output: part.result }
    case 'error':
      return { ...base, state: 'output-error', errorText: part.error ?? '' }
    default:
      return { ...base, state: 'input-available' }
  }
}

function toPart(part: UIMessagePart): AISDKUIPart {
  switch (part.type) {
    case 'tool-call':
      return toToolPart(part)
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
 * sources `source-url` parts and data parts `data-<name>` parts. The conversion is shallow:
 * the input isn't modified, but unchanged parts (text, reasoning, files) and `metadata` are shared.
 */
export function toUIMessages(messages: readonly UIMessage[]): AISDKUIMessage[] {
  return messages.map((message) => {
    const converted: AISDKUIMessage = { id: message.id, role: message.role, parts: message.parts.map(toPart) }
    if (message.metadata !== undefined) converted.metadata = message.metadata
    return converted
  })
}
