// Type-level check (run by `npm run typecheck`): toUIMessages output must be assignable to the
// AI SDK's own UIMessage, which is what Nuxt UI's chat components expect when `ai` is installed.
import type { UIMessage } from 'ai'
import { toUIMessages } from '../../src/utils/ui-messages'
import type { AISDKToolPart } from '../../src/utils/ui-messages'

export const messages: UIMessage[] = toUIMessages([])

type ToolPart = Extract<UIMessage['parts'][number], { type: `tool-${string}` }>
export const toolPart = (part: AISDKToolPart): ToolPart => part
