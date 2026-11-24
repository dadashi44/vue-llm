// Types of `vue-llm/components/vue2`, published as dist/vue2/components.d.ts (see vite.vue2.config.ts).
// Hand-written because vue-tsc emits Vue 3 component types; these use Vue 2.7's own `DefineComponent`.
import type { Component, DefineComponent } from 'vue'
import type { DataPart, ToolCallPart, UIMessage } from '../types.js'

export interface StreamMarkdownProps {
  content: string
  streaming?: boolean
  /** Markdown renderer, `renderMarkdown` by default */
  render?: (markdown: string) => string
}

export interface MessagePartsProps {
  message: UIMessage
  /** Components that render tool calls, keyed by tool name (Generative UI) */
  components?: Record<string, Component>
  /** Components that render data parts, keyed by their `name` */
  dataComponents?: Record<string, Component>
  /** Markdown renderer for text parts, see StreamMarkdown */
  render?: (markdown: string) => string
}

/** Props of the `tool` and `data` scoped slots of MessageParts */
export interface MessagePartsSlotProps {
  tool: { part: ToolCallPart; addResult: (result: unknown) => void }
  data: { part: DataPart }
}

export declare const StreamMarkdown: DefineComponent<StreamMarkdownProps>
export declare const MessageParts: DefineComponent<
  MessagePartsProps,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- DefineComponent's own defaults, to reach the emits parameter
  {}, {}, {}, {}, {}, {},
  { 'tool-result': (payload: { toolCallId: string; result: unknown }) => void }
>
export { renderMarkdown, renderInline, escapeHTML } from '../core/markdown.js'
