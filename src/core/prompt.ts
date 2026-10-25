import type { ChatMessage } from '../providers/types'
import type { UIMessage } from '../types'
import { generateId } from '../utils/generate-id'

export type PromptValue = string | number | boolean

type Trim<S extends string> = S extends ` ${infer R}` ? Trim<R> : S extends `${infer R} ` ? Trim<R> : S

export type PromptVariableNames<T extends string> = T extends `${string}{{${infer V}}}${infer Rest}`
  ? Trim<V> | PromptVariableNames<Rest>
  : never

export type PromptVariables<T extends string> = string extends T
  ? Record<string, PromptValue>
  : [PromptVariableNames<T>] extends [never]
    ? Record<string, never>
    : { [K in PromptVariableNames<T>]: PromptValue }

export interface PromptOptions<D> {
  defaults?: D
}

export type PromptInput<V, D> = Omit<V, keyof D> & Partial<V>

export interface PromptTemplate<T extends string, D = object> {
  readonly template: T
  readonly variables: string[]
  render(variables: PromptInput<PromptVariables<T>, D>): string
}

const VARIABLE_PATTERN = /(\\)?\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g

export function createPrompt<const T extends string, const D extends Partial<PromptVariables<T>> = object>(
  template: T,
  options: PromptOptions<D> = {},
): PromptTemplate<T, D> {
  return {
    template,
    variables: extractVariables(template),
    render(variables) {
      return renderTemplate(template, { ...options.defaults, ...variables } as Record<string, PromptValue | undefined>)
    },
  }
}

export interface ChatPromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatPromptVariables<T extends readonly ChatPromptMessage[]> = PromptVariables<T[number]['content']>

export interface ChatPromptTemplate<T extends readonly ChatPromptMessage[], D = object> {
  readonly messages: T
  readonly variables: string[]
  render(variables: PromptInput<ChatPromptVariables<T>, D>): ChatMessage[]
  toUIMessages(variables: PromptInput<ChatPromptVariables<T>, D>): UIMessage[]
}

export function createChatPrompt<
  const T extends readonly ChatPromptMessage[],
  const D extends Partial<ChatPromptVariables<T>> = object,
>(
  messages: T,
  options: PromptOptions<D> = {},
): ChatPromptTemplate<T, D> {
  const render = (variables: PromptInput<ChatPromptVariables<T>, D>): ChatMessage[] => {
    const values = { ...options.defaults, ...variables } as Record<string, PromptValue | undefined>
    return messages.map(msg => ({ role: msg.role, content: renderTemplate(msg.content, values) }))
  }

  return {
    messages,
    variables: [...new Set(messages.flatMap(m => extractVariables(m.content)))],
    render,
    toUIMessages(variables) {
      return render(variables).map(msg => ({
        id: generateId(),
        role: msg.role as UIMessage['role'],
        parts: [{ type: 'text', text: msg.content as string, state: 'done' }],
        createdAt: new Date(),
      }))
    },
  }
}

export function renderTemplate(template: string, variables: Record<string, PromptValue | undefined>): string {
  return template.replace(VARIABLE_PATTERN, (match, escaped: string | undefined, name: string) => {
    if (escaped) return match.slice(1)
    const value = variables[name]
    if (value === undefined || value === null) {
      throw new Error(`[vue-llm] Missing prompt variable "${name}"`)
    }
    return String(value)
  })
}

function extractVariables(template: string): string[] {
  const names = new Set<string>()
  for (const [, escaped, name] of template.matchAll(VARIABLE_PATTERN)) {
    if (!escaped) names.add(name)
  }
  return [...names]
}
