import type { Ref } from 'vue'
import type { ChatStatus, UIMessage, UIMessagePart } from '../types'
import type { ChatStreamChunk, FinishReason, Usage } from '../providers/types'

export interface StreamCallbacks {
  onFinish?: (message: UIMessage, context: { finishReason: FinishReason; usage?: Usage }) => void
  onError?: (error: Error) => void
  onToolCall?: (toolCall: { toolCallId: string; toolName: string; args: unknown }) => unknown | Promise<unknown>
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
    this.status.value = 'streaming'

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

          if (callbacks.onToolCall) {
            const part = this.findToolCallPart(assistantMsg, value.toolCallId)
            if (part) {
              part.state = 'running'
              part.args = args
            }
            this.triggerReactivity()

            try {
              const result = await callbacks.onToolCall(tc)
              if (result !== undefined && part) {
                part.state = 'result'
                part.result = result
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
    return msg
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
          state: 'pending',
        })
        toolCallArgs.set(chunk.toolCallId, '')
        break

      case 'tool-call-delta':
        toolCallArgs.set(
          chunk.toolCallId,
          (toolCallArgs.get(chunk.toolCallId) ?? '') + chunk.args,
        )
        break

      case 'tool-call-end':
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

  private findToolCallPart(msg: UIMessage, toolCallId: string) {
    return msg.parts.find(
      (p): p is UIMessagePart & { type: 'tool-call' } =>
        p.type === 'tool-call' && p.toolCallId === toolCallId,
    ) as (UIMessagePart & { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown; state: string; result?: unknown; error?: string }) | undefined
  }

  private getToolName(msg: UIMessage, toolCallId: string): string {
    const part = this.findToolCallPart(msg, toolCallId)
    return part?.toolName ?? ''
  }

  private triggerReactivity(): void {
    this.messages.value = [...this.messages.value]
  }
}
