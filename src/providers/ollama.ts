import type { ChatMessage, ChatRequest, ChatResponse, ChatStreamChunk, ChatStreamResult, LLMProvider } from './types'

export interface OllamaConfig {
  baseURL?: string
}

export function createOllama(config?: OllamaConfig): LLMProvider {
  return {
    id: 'ollama',
    supportsStreaming: true,

    validateConfig() {},

    async chat(request: ChatRequest): Promise<ChatStreamResult> {
      const url = (config?.baseURL ?? 'http://localhost:11434') + '/api/chat'

      const body: Record<string, unknown> = {
        model: request.model,
        messages: toOllamaMessages(request.messages),
        stream: true,
      }

      if (request.tools?.length) {
        body.tools = request.tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }))
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: request.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`[vue-llm] Ollama API error ${response.status}: ${text}`)
      }

      if (!response.body) {
        throw new Error('[vue-llm] No response body from Ollama')
      }

      let resolveResponse: (value: ChatResponse) => void
      const responsePromise = new Promise<ChatResponse>(r => { resolveResponse = r })

      let buffer = ''

      const stream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream<string, ChatStreamChunk>({
          transform(chunk, controller) {
            buffer += chunk
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.trim()) continue

              let parsed: OllamaChatChunk
              try {
                parsed = JSON.parse(line)
              } catch {
                continue
              }

              if (parsed.message?.content) {
                controller.enqueue({ type: 'text-delta', text: parsed.message.content })
              }

              if (parsed.message?.tool_calls) {
                for (const tc of parsed.message.tool_calls) {
                  const id = `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                  controller.enqueue({
                    type: 'tool-call-start',
                    toolCallId: id,
                    toolName: tc.function.name,
                  })
                  controller.enqueue({
                    type: 'tool-call-delta',
                    toolCallId: id,
                    args: JSON.stringify(tc.function.arguments),
                  })
                  controller.enqueue({ type: 'tool-call-end', toolCallId: id })
                }
              }

              if (parsed.done) {
                controller.enqueue({ type: 'finish', finishReason: 'stop' })
                resolveResponse!({
                  finishReason: 'stop',
                  usage: parsed.eval_count ? {
                    promptTokens: parsed.prompt_eval_count ?? 0,
                    completionTokens: parsed.eval_count,
                    totalTokens: (parsed.prompt_eval_count ?? 0) + parsed.eval_count,
                  } : undefined,
                })
              }
            }
          },
        }))

      return { stream, response: responsePromise }
    },
  }
}

function toOllamaMessages(messages: ChatMessage[]): unknown[] {
  return messages.map(msg => ({
    role: msg.role,
    content: typeof msg.content === 'string' ? msg.content : msg.content.map(p => p.type === 'text' ? p.text : '').join(''),
  }))
}

interface OllamaChatChunk {
  message?: {
    content?: string
    tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]
  }
  done: boolean
  eval_count?: number
  prompt_eval_count?: number
}
