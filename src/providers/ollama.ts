import type { ChatMessage, ChatRequest, ChatResponse, ChatStreamChunk, ChatStreamResult, LLMProvider } from './types'
import { decodeBase64Text, isTextMediaType, resolveFilePart } from '../utils/file'
import { createAPIError } from '../core/errors'

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
        throw await createAPIError('ollama', 'Ollama API', response)
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
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }

    const texts: string[] = []
    const images: string[] = []

    for (const part of msg.content) {
      if (part.type === 'text') {
        texts.push(part.text)
        continue
      }

      const file = resolveFilePart(part)
      if (!file.base64) {
        throw new Error('[vue-llm] Ollama requires attachments as data URLs, got a remote URL')
      }
      if (file.mediaType.startsWith('image/')) {
        images.push(file.base64)
      } else if (isTextMediaType(file.mediaType)) {
        texts.push(decodeBase64Text(file.base64))
      } else {
        throw new Error(`[vue-llm] Ollama does not support ${file.mediaType} attachments`)
      }
    }

    return {
      role: msg.role,
      content: texts.join('\n\n'),
      ...(images.length > 0 ? { images } : {}),
    }
  })
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
