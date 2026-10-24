import { addImports, createResolver, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'vue-llm',
    configKey: 'vueLlm',
    compatibility: { nuxt: '>=3.5.0' },
  },
  defaults: {},
  setup(_options: Record<string, never>, nuxt: { options: { runtimeConfig: Record<string, unknown> } }) {
    const resolver = createResolver(import.meta.url)

    addImports([
      { name: 'useChat', from: resolver.resolve('./index') },
      { name: 'useCompletion', from: resolver.resolve('./index') },
      { name: 'useObject', from: resolver.resolve('./index') },
    ])

    addImports([
      { name: 'createOpenAI', from: resolver.resolve('./providers') },
      { name: 'createAnthropic', from: resolver.resolve('./providers') },
      { name: 'createOllama', from: resolver.resolve('./providers') },
    ])

    nuxt.options.runtimeConfig.vueLlm = {
      ...nuxt.options.runtimeConfig.vueLlm as Record<string, string>,
      openaiApiKey: '',
      anthropicApiKey: '',
    }
  },
})
