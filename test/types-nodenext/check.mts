// Type-checks the built package (dist/) the way a Node.js project with
// moduleResolution "nodenext" sees it. Run `npm run build` first.
// Regression test for https://github.com/dadashi44/vue-llm/issues/25
import { useChat, useCompletion, useObject } from 'vue-llm'
import { createOpenAI, createAnthropic } from 'vue-llm/providers'
import { MessageParts, StreamMarkdown, renderMarkdown } from 'vue-llm/components'
import { createLLMHandler, streamToSSE } from 'vue-llm/server'
import type { LLMProvider, ToolDefinition } from 'vue-llm'
import { LLMDevtools } from 'vue-llm/devtools'
import { mcpTools } from 'vue-llm/mcp'

type IsAny<T> = 0 extends 1 & T ? true : false
type NotAny<T> = IsAny<T> extends true ? never : T

function assertTyped<T>(_value: NotAny<T>): void {}

assertTyped(useChat)
assertTyped(useCompletion)
assertTyped(useObject)
assertTyped(createOpenAI)
assertTyped(createAnthropic)
assertTyped(MessageParts)
assertTyped(StreamMarkdown)
assertTyped(renderMarkdown)
assertTyped(createLLMHandler)
assertTyped(streamToSSE)
assertTyped(LLMDevtools)
assertTyped(mcpTools)
assertTyped<LLMProvider>({} as LLMProvider)
assertTyped<ToolDefinition>({} as ToolDefinition)
