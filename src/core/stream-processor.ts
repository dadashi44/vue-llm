import type { Ref } from 'vue'
import type { ChatStatus, ToolCallPart, UIMessage } from '../types'
import type { ChatStreamChunk } from '../providers/types'
import type { FinishReason, Usage } from '../types'
import { parsePartialJSON } from './partial-json'

export interface StreamCallbacks {
  onFinish?: (message: UIMessage, context: { finishReason: FinishReason; usage?: Usage }) => void
  onError?: (error: Error) => void
  onToolCall?: (
    toolCall: { toolCallId: string; toolName: string; args: unknown },
    context: { signal: AbortSignal },
  ) => unknown | Promise<unknown>
  /** Whether `onToolCall` can handle a tool; calls it cannot handle stay `pending` without flashing `running` */
  canHandleTool?: (toolName: string) => boolean
}

export class StreamProcessor {
  constructor(
    private messages: Ref<UIMessage[]>,
    private status: Ref<ChatStatus>,
    private generateId: () => string,
  ) {}

  async processStream(
    stream: ReadableStream<ChatStreamChunk>,
    signal: AbortSignal,
    callbacks: StreamCallbacks,
  ): Promise<{ finishReason: FinishReason; usage?: Usage; toolCalls: { toolCallId: string; toolName: string; args: unknown }[] }> {
    if (!signal.aborted) this.status.value = 'streaming'

    const assistantMsg = this.getOrCreateAssistantMessage()
    const toolCallArgs = new Map<string, string>()
    const toolCalls: { toolCallId: string; toolName: string; args: unknown }[] = []
    let finishReason: FinishReason = 'stop'
    let usage: Usage | undefined

    const reader = stream.getReader()

    try {
      while (true) {
        if (signal.aborted) break

        const { done, value } = await reader.read()
        if (done) break

        this.applyChunk(assistantMsg, value, toolCallArgs)

        if (value.type === 'tool-call-end') {
          const argsStr = toolCallArgs.get(value.toolCallId) ?? '{}'
          let args: unknown
          try {
            args = JSON.parse(argsStr)
          } catch {
            args = argsStr
          }

          const tc = { toolCallId: value.toolCallId, toolName: this.getToolName(assistantMsg, value.toolCallId), args }
          toolCalls.push(tc)

          const part = this.findToolCallPart(assistantMsg, value.toolCallId)
          if (part) {
            part.args = args
            part.state = 'pending'
          }

          if (callbacks.onToolCall && (callbacks.canHandleTool?.(tc.toolName) ?? true)) {
            if (part) part.state = 'running'
            this.triggerReactivity()

            try {
              const result = await callbacks.onToolCall(tc, { signal })
              if (part) {
                // undefined means the result comes later, e.g. from the user via addToolResult
                if (result === undefined) {
                  part.state = 'pending'
                } else {
                  part.state = 'result'
                  part.result = result
                }
                this.triggerReactivity()
              }
            } catch (e) {
              if (part) {
                part.state = 'error'
                part.error = e instanceof Error ? e.message : String(e)
                this.triggerReactivity()
              }
            }
          }
        }

        if (value.type === 'tool-result') {
          const part = this.findToolCallPart(assistantMsg, value.toolCallId)
          if (part) {
            part.state = value.error !== undefined ? 'error' : 'result'
            part.result = value.result
            part.error = value.error
          }
          const index = toolCalls.findIndex(tc => tc.toolCallId === value.toolCallId)
          if (index !== -1) toolCalls.splice(index, 1)
        }

        if (value.type === 'finish') {
          finishReason = value.finishReason
          usage = value.usage
        }

        if (value.type === 'error') {
          throw value.error
        }

        this.triggerReactivity()
      }
    } catch (err) {
      if (!signal.aborted) {
        const error = err instanceof Error ? err : new Error(String(err))
        callbacks.onError?.(error)
        throw error
      }
    } finally {
      reader.releaseLock()
    }

    this.finalizeTextParts(assistantMsg)
    this.triggerReactivity()

    callbacks.onFinish?.(assistantMsg, { finishReason, usage })

    return { finishReason, usage, toolCalls }
  }

  private getOrCreateAssistantMessage(): UIMessage {
    const msgs = this.messages.value
    const last = msgs[msgs.length - 1]
    if (last?.role === 'assistant') return last

    const msg: UIMessage = {
      id: this.generateId(),
      role: 'assistant',
      parts: [],
      createdAt: new Date(),
    }
    msgs.push(msg)
    // Return the reactive proxy, so in-place updates re-render components that receive the message as a prop
    return msgs[msgs.length - 1]
  }

  private applyChunk(msg: UIMessage, chunk: ChatStreamChunk, toolCallArgs: Map<string, string>): void {
    switch (chunk.type) {
      case 'text-delta': {
        const lastPart = msg.parts[msg.parts.length - 1]
        if (lastPart?.type === 'text' && lastPart.state === 'streaming') {
          lastPart.text += chunk.text
        } else {
          msg.parts.push({ type: 'text', text: chunk.text, state: 'streaming' })
        }
        break
      }

      case 'reasoning-delta': {
        const lastPart = msg.parts[msg.parts.length - 1]
        if (lastPart?.type === 'reasoning' && lastPart.state === 'streaming') {
          lastPart.text += chunk.text
        } else {
          msg.parts.push({ type: 'reasoning', text: chunk.text, state: 'streaming' })
        }
        break
      }

      case 'tool-call-start':
        msg.parts.push({
          type: 'tool-call',
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          args: undefined,
          state: 'streaming',
        })
        toolCallArgs.set(chunk.toolCallId, '')
        break

      case 'tool-call-delta': {
        const args = (toolCallArgs.get(chunk.toolCallId) ?? '') + chunk.args
        toolCallArgs.set(chunk.toolCallId, args)
        // Expose arguments as they stream so tool UIs can render early
        const part = this.findToolCallPart(msg, chunk.toolCallId)
        const partial = parsePartialJSON(args)
        if (part && partial !== undefined) part.args = partial
        break
      }

      case 'tool-call-end':
      case 'tool-result':
        break

      case 'finish':
      case 'error':
        break
    }
  }

  private finalizeTextParts(msg: UIMessage): void {
    for (const part of msg.parts) {
      if ((part.type === 'text' || part.type === 'reasoning') && part.state === 'streaming') {
        part.state = 'done'
      }
    }
  }

  private findToolCallPart(msg: UIMessage, toolCallId: string): ToolCallPart | undefined {
    return msg.parts.find((p): p is ToolCallPart => p.type === 'tool-call' && p.toolCallId === toolCallId)
  }

  private getToolName(msg: UIMessage, toolCallId: string): string {
    const part = this.findToolCallPart(msg, toolCallId)
    return part?.toolName ?? ''
  }

  private triggerReactivity(): void {
    this.messages.value = [...this.messages.value]
  }
}
