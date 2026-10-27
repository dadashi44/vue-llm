import { computed, type ComputedRef } from 'vue'
import { type MaybeRefOrGetter, toValue } from '../utils/vue'
import { createPrompt, type PromptInput, type PromptTemplate, type PromptVariables } from '../core/prompt'

export function usePrompt<const T extends string, D = object>(
  template: T | PromptTemplate<T, D>,
  variables: MaybeRefOrGetter<PromptInput<PromptVariables<T>, D>>,
): ComputedRef<string> {
  const prompt = (typeof template === 'string' ? createPrompt(template) : template) as PromptTemplate<T, D>
  return computed(() => prompt.render(toValue(variables)))
}
