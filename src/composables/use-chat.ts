import { computed, type MaybeRef, onScopeDispose, ref, type Ref, toValue } from 'vue'
import type { ChatStatus, FinishReason, ToolDefinition, UIMessage, Usage } from '../types'
import type { ChatMessage, LLMProvider } from '../providers/types'
import { StreamProcessor } from '../core/stream-processor'
import { generateId } from '../utils/generate-id'

export interface UseChatOptions {
  id?: string
  provider: LLMProvider
  model: string
  system?: string
  initialMessages?: UIMessage[]
  body?: MaybeRef<Record<string, unknown>>
  providerOptions?: Record<string, unknown>
  tools?: ToolDefinition[]
  onToolCall?: (toolCall: { toolCallId: string; toolName: string; args: unknown }) => unknown | Promise<unknown>
  onFinish?: (message: UIMessage, context: { finishReason: FinishReason; usage?: Usage }) => void
  onError?: (error: Error) => void
  maxToolRoundtrips?: number
}

export interface UseChatReturn {
  messages: Ref<UIMessage[]>
  status: Ref<ChatStatus>
  error: Ref<Error | undefined>
  id: string
  input: Ref<string>
  sendMessage: (message?: string | { text?: string; files?: File[] }) => Promise<void>
  regenerate: () => Promise<void>
  stop: () => void
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void
  handleSubmit: (event?: Event) => void
  isLoading: Ref<boolean>
  addToolResult: (options: { toolCallId: string; result: unknown }) => void
  clearError: () => void
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const id = options.id ?? generateId()
  const messages = ref<UIMessage[]>(options.initialMessages ?? []) as Ref<UIMessage[]>
  const status = ref<ChatStatus>('ready') as Ref<ChatStatus>
  const error = ref<Error | undefined>(undefined)
  const input = ref('')

  let abortController: AbortController | null = null

  const processor = new StreamProcessor(messages, status as Ref<ChatStatus>, generateId)

  const buildChatMessages = (): ChatMessage[] => {
    const chatMessages: ChatMessage[] = []

    if (options.system) {
      chatMessages.push({ role: 'system', content: options.system })
    }

    for (const msg of messages.value) {
      if (msg.role === 'system') continue

      const textParts = msg.parts.filter(p => p.type === 'text')
      const text = textParts.map(p => p.text).join('')

      const toolCalls = msg.parts
        .filter(p => p.type === 'tool-call')
        .map(p => ({ id: p.toolCallId, name: p.toolName, args: p.args }))

      if (msg.role === 'user') {
        chatMessages.push({ role: 'user', content: text })
      } else if (msg.role === 'assistant') {
        chatMessages.push({
          role: 'assistant',
          content: text,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        })

        for (const tc of msg.parts.filter(p => p.type === 'tool-call' && p.state === 'result')) {
          chatMessages.push({
            role: 'tool',
            content: JSON.stringify(tc.result),
            toolCallId: tc.toolCallId,
          })
        }
      }
    }

    return chatMessages
  }

  const submitToProvider = async (signal: AbortSignal): Promise<void> => {
    const maxRoundtrips = options.maxToolRoundtrips ?? 5
    let roundtrip = 0

    while (roundtrip < maxRoundtrips) {
      const chatMessages = buildChatMessages()

      options.provider.validateConfig()

      const { stream } = await options.provider.chat({
        model: options.model,
        messages: chatMessages,
        tools: options.tools,
        signal,
        providerOptions: {
          ...options.providerOptions,
          ...toValue(options.body),
        },
      })

      const result = await processor.processStream(stream, signal, {
        onFinish: options.onFinish,
        onError: options.onError,
        onToolCall: options.onToolCall,
      })

      if (result.finishReason !== 'tool-calls' || result.toolCalls.length === 0) {
        break
      }

      roundtrip++
    }
  }

  const sendMessage = async (message?: string | { text?: string; files?: File[] }): Promise<void> => {
    const text = typeof message === 'string'
      ? message
      : message?.text ?? input.value

    if (!text.trim()) return

    if (typeof message !== 'object' || message === null || !('text' in message)) {
      input.value = ''
    }

    const userMessage: UIMessage = {
      id: generateId(),
      role: 'user',
      parts: [{ type: 'text', text, state: 'done' }],
      createdAt: new Date(),
    }

    messages.value = [...messages.value, userMessage]
    error.value = undefined
    status.value = 'submitted'

    abortController?.abort()
    abortController = new AbortController()

    try {
      await submitToProvider(abortController.signal)
      status.value = 'ready'
    } catch (err) {
      if (abortController.signal.aborted) {
        status.value = 'ready'
        return
      }
      error.value = err instanceof Error ? err : new Error(String(err))
      status.value = 'error'
    }
  }

  const regenerate = async (): Promise<void> => {
    const msgs = messages.value
    const lastAssistant = msgs.findLastIndex(m => m.role === 'assistant')
    if (lastAssistant === -1) return

    messages.value = msgs.slice(0, lastAssistant)
    error.value = undefined
    status.value = 'submitted'

    abortController?.abort()
    abortController = new AbortController()

    try {
      await submitToProvider(abortController.signal)
      status.value = 'ready'
    } catch (err) {
      if (abortController.signal.aborted) {
        status.value = 'ready'
        return
      }
      error.value = err instanceof Error ? err : new Error(String(err))
      status.value = 'error'
    }
  }

  const stop = (): void => {
    abortController?.abort()
    abortController = null
    status.value = 'ready'
  }

  const setMessages = (value: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])): void => {
    messages.value = typeof value === 'function' ? value(messages.value) : value
  }

  const handleSubmit = (event?: Event): void => {
    event?.preventDefault?.()
    if (!input.value.trim()) return
    sendMessage()
  }

  const isLoading = computed(() => status.value === 'submitted' || status.value === 'streaming')

  const addToolResult = ({ toolCallId, result }: { toolCallId: string; result: unknown }): void => {
    for (const msg of messages.value) {
      for (const part of msg.parts) {
        if (part.type === 'tool-call' && part.toolCallId === toolCallId) {
          part.state = 'result'
          part.result = result
          messages.value = [...messages.value]
          return
        }
      }
    }
  }

  const clearError = (): void => {
    error.value = undefined
    if (status.value === 'error') {
      status.value = 'ready'
    }
  }

  onScopeDispose(() => {
    abortController?.abort()
  })

  return {
    messages,
    status: computed(() => status.value),
    error,
    id,
    input,
    sendMessage,
    regenerate,
    stop,
    setMessages,
    handleSubmit,
    isLoading,
    addToolResult,
    clearError,
  }
}
