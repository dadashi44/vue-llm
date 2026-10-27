import { computed, getCurrentScope, onScopeDispose, ref, type Ref, watch } from 'vue'
import { type MaybeRef, type MaybeRefOrGetter, toValue } from '../utils/vue'
import type { ChatStatus, ChatTool, FinishReason, ToolCallPart, UIMessage, UIMessagePart, Usage } from '../types'
import type { ChatMessage, ContentPart, LLMProvider } from '../providers/types'
import { StreamProcessor } from '../core/stream-processor'
import type { ChatStorage } from '../core/storage'
import { generateId } from '../utils/generate-id'
import { convertFilesToParts, type FileInput } from '../utils/file'

export type SendMessageInput = string | { text?: string; files?: FileInput }

export interface UseChatOptions {
  id?: string
  provider: LLMProvider
  model: MaybeRefOrGetter<string>
  system?: MaybeRefOrGetter<string | undefined>
  initialMessages?: UIMessage[]
  body?: MaybeRef<Record<string, unknown>>
  providerOptions?: Record<string, unknown>
  /** Tools with `execute` run automatically; others go to `onToolCall` or wait for `addToolResult` */
  tools?: ChatTool[]
  /** Return a result to resolve the call, or `undefined` to resolve it later with `addToolResult` */
  onToolCall?: (toolCall: { toolCallId: string; toolName: string; args: unknown }) => unknown | Promise<unknown>
  onFinish?: (message: UIMessage, context: { finishReason: FinishReason; usage?: Usage }) => void
  onError?: (error: Error) => void
  maxToolRoundtrips?: number
  /** Continue the conversation once `addToolResult` has resolved every pending call. Default `true`. */
  autoSendToolResults?: boolean
  storage?: ChatStorage
}

export interface UseChatReturn {
  messages: Ref<UIMessage[]>
  status: Ref<ChatStatus>
  error: Ref<Error | undefined>
  id: string
  input: Ref<string>
  sendMessage: (message?: SendMessageInput) => Promise<void>
  regenerate: () => Promise<void>
  stop: () => void
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void
  handleSubmit: (event?: Event) => void
  isLoading: Ref<boolean>
  /** Resolve a tool call from the UI. Continues the chat when no other call is pending. */
  addToolResult: (options: { toolCallId: string; result?: unknown; error?: string }) => Promise<void>
  clearError: () => void
  isRestored: Ref<boolean>
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const id = options.id ?? generateId()
  const messages = ref<UIMessage[]>(options.initialMessages ?? []) as Ref<UIMessage[]>
  const status = ref<ChatStatus>('ready') as Ref<ChatStatus>
  const error = ref<Error | undefined>(undefined)
  const input = ref('')

  let abortController: AbortController | null = null

  const isRestored = ref(!options.storage)
  const storage = options.storage

  const reportError = (err: unknown): void => {
    options.onError?.(err instanceof Error ? err : new Error(String(err)))
  }

  if (storage) {
    const initialMessages = messages.value
    const applyStored = (stored: UIMessage[] | null | undefined): void => {
      if (stored?.length && messages.value === initialMessages) {
        messages.value = stored
      }
      isRestored.value = true
    }

    try {
      const loaded = storage.load(id)
      if (loaded instanceof Promise) {
        loaded.then(applyStored, (err: unknown) => {
          reportError(err)
          isRestored.value = true
        })
      } else {
        applyStored(loaded)
      }
    } catch (err) {
      reportError(err)
      isRestored.value = true
    }

    watch([messages, status, isRestored], () => {
      if (!isRestored.value || status.value === 'submitted' || status.value === 'streaming') return
      try {
        const result = messages.value.length > 0
          ? storage.save(id, messages.value)
          : storage.remove(id)
        if (result instanceof Promise) result.catch(reportError)
      } catch (err) {
        reportError(err)
      }
    }, { deep: true })
  }

  const processor = new StreamProcessor(messages, status as Ref<ChatStatus>, generateId)

  const buildChatMessages = (): ChatMessage[] => {
    const chatMessages: ChatMessage[] = []

    const systemTexts = [
      toValue(options.system),
      ...messages.value
        .filter(m => m.role === 'system')
        .map(m => m.parts.filter(p => p.type === 'text').map(p => p.text).join('')),
    ].filter(Boolean)
    if (systemTexts.length > 0) {
      chatMessages.push({ role: 'system', content: systemTexts.join('\n\n') })
    }

    for (const msg of messages.value) {
      if (msg.role === 'system') continue

      const textParts = msg.parts.filter(p => p.type === 'text')
      const text = textParts.map(p => p.text).join('')

      const toolCalls = msg.parts
        .filter(p => p.type === 'tool-call')
        .map(p => ({ id: p.toolCallId, name: p.toolName, args: p.args }))

      if (msg.role === 'user') {
        const fileParts = msg.parts.filter(p => p.type === 'file')
        if (fileParts.length === 0) {
          chatMessages.push({ role: 'user', content: text })
          continue
        }
        const content: ContentPart[] = fileParts.map(p => ({
          type: 'file',
          url: p.url,
          mediaType: p.mediaType,
          filename: p.filename,
        }))
        if (text) content.push({ type: 'text', text })
        chatMessages.push({ role: 'user', content })
      } else if (msg.role === 'assistant') {
        chatMessages.push({
          role: 'assistant',
          content: text,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        })

        // Every call needs an answer, or providers reject the history
        for (const part of msg.parts) {
          if (part.type !== 'tool-call') continue
          chatMessages.push({
            role: 'tool',
            content: part.state === 'result'
              ? JSON.stringify(part.result ?? null)
              : JSON.stringify({ error: part.error ?? 'The tool call was not answered' }),
            toolCallId: part.toolCallId,
          })
        }
      }
    }

    return chatMessages
  }

  const providerTools = options.tools?.map(({ name, description, parameters }) => ({ name, description, parameters }))

  const runTool = (
    toolCall: { toolCallId: string; toolName: string; args: unknown },
    { signal }: { signal: AbortSignal },
  ): unknown | Promise<unknown> => {
    const tool = options.tools?.find(t => t.name === toolCall.toolName)
    if (tool?.execute) return tool.execute(toolCall.args, { toolCallId: toolCall.toolCallId, signal })
    return options.onToolCall?.(toolCall)
  }

  const hasUnresolvedToolCalls = (): boolean => {
    const last = messages.value[messages.value.length - 1]
    return last?.role === 'assistant' && last.parts.some(
      p => p.type === 'tool-call' && p.state !== 'result' && p.state !== 'error',
    )
  }

  const submitToProvider = async (signal: AbortSignal): Promise<void> => {
    const maxRoundtrips = options.maxToolRoundtrips ?? 5
    let roundtrip = 0

    while (roundtrip < maxRoundtrips) {
      const chatMessages = buildChatMessages()

      options.provider.validateConfig()

      const { stream } = await options.provider.chat({
        model: toValue(options.model),
        messages: chatMessages,
        tools: providerTools,
        signal,
        providerOptions: {
          ...options.providerOptions,
          ...toValue(options.body),
        },
      })

      const result = await processor.processStream(stream, signal, {
        onFinish: options.onFinish,
        onError: options.onError,
        onToolCall: runTool,
        canHandleTool: name => !!options.onToolCall || !!options.tools?.find(t => t.name === name)?.execute,
      })

      // Stop when the model is done, or pause until the UI answers the remaining calls
      if (result.finishReason !== 'tool-calls' || result.toolCalls.length === 0 || hasUnresolvedToolCalls()) {
        break
      }

      roundtrip++
    }
  }

  const sendMessage = async (message?: SendMessageInput): Promise<void> => {
    const text = typeof message === 'string'
      ? message
      : message?.text ?? input.value

    let fileParts: UIMessagePart[]
    try {
      fileParts = typeof message === 'object' ? await convertFilesToParts(message.files) : []
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      status.value = 'error'
      return
    }

    if (!text.trim() && fileParts.length === 0) return

    if (typeof message !== 'object' || message === null || !('text' in message)) {
      input.value = ''
    }

    const parts: UIMessagePart[] = [...fileParts]
    if (text.trim()) parts.push({ type: 'text', text, state: 'done' })

    const userMessage: UIMessage = {
      id: generateId(),
      role: 'user',
      parts,
      createdAt: new Date(),
    }

    messages.value = [...messages.value, userMessage]
    await run()
  }

  const run = async (): Promise<void> => {
    error.value = undefined
    status.value = 'submitted'

    abortController?.abort()
    const controller = new AbortController()
    abortController = controller

    try {
      await submitToProvider(controller.signal)
      if (abortController === controller) status.value = 'ready'
    } catch (err) {
      if (controller.signal.aborted) {
        if (abortController === controller) status.value = 'ready'
        return
      }
      error.value = err instanceof Error ? err : new Error(String(err))
      status.value = 'error'
    }
  }

  const regenerate = async (): Promise<void> => {
    const msgs = messages.value
    const lastAssistant = msgs.reduce((acc, m, i) => m.role === 'assistant' ? i : acc, -1)
    if (lastAssistant === -1) return

    messages.value = msgs.slice(0, lastAssistant)
    await run()
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

  const addToolResult = async (
    { toolCallId, result, error: toolError }: { toolCallId: string; result?: unknown; error?: string },
  ): Promise<void> => {
    const part = messages.value
      .flatMap(m => m.parts)
      .find((p): p is ToolCallPart => p.type === 'tool-call' && p.toolCallId === toolCallId)
    if (!part) return

    if (toolError !== undefined) {
      part.state = 'error'
      part.error = toolError
    } else {
      part.state = 'result'
      part.result = result
    }
    messages.value = [...messages.value]

    const last = messages.value[messages.value.length - 1]
    const isLatest = last?.role === 'assistant' && last.parts.includes(part)
    const busy = status.value === 'submitted' || status.value === 'streaming'
    if ((options.autoSendToolResults ?? true) && isLatest && !busy && !hasUnresolvedToolCalls()) {
      await run()
    }
  }

  const clearError = (): void => {
    error.value = undefined
    if (status.value === 'error') {
      status.value = 'ready'
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      abortController?.abort()
    })
  }

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
    isRestored: computed(() => isRestored.value),
  }
}
