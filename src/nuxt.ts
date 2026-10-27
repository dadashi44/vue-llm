import { addComponent, addImports, createResolver, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'vue-llm',
    configKey: 'vueLlm',
    compatibility: { nuxt: '>=3.5.0' },
  },
  defaults: {},
  setup(_options: Record<string, never>, nuxt: { options: { runtimeConfig: Record<string, unknown>; css: string[] } }) {
    const resolver = createResolver(import.meta.url)

    addImports([
      { name: 'useChat', from: resolver.resolve('./index') },
      { name: 'useCompletion', from: resolver.resolve('./index') },
      { name: 'useObject', from: resolver.resolve('./index') },
      { name: 'usePrompt', from: resolver.resolve('./index') },
      { name: 'createPrompt', from: resolver.resolve('./index') },
      { name: 'createChatPrompt', from: resolver.resolve('./index') },
      { name: 'defineTool', from: resolver.resolve('./index') },
    ])

    addImports([
      { name: 'createOpenAI', from: resolver.resolve('./providers') },
      { name: 'createAnthropic', from: resolver.resolve('./providers') },
      { name: 'createGoogle', from: resolver.resolve('./providers') },
      { name: 'createOllama', from: resolver.resolve('./providers') },
      { name: 'createSSEProvider', from: resolver.resolve('./providers') },
      { name: 'createWebLLM', from: resolver.resolve('./providers') },
      { name: 'isWebGPUSupported', from: resolver.resolve('./providers') },
    ])

    // Lowest priority, so an app component with the same name wins
    for (const name of ['StreamMarkdown', 'MessageParts']) {
      addComponent({ name, export: name, filePath: resolver.resolve('./components'), priority: -1 })
    }
    nuxt.options.css.push(resolver.resolve('./vue-llm.css'))

    nuxt.options.runtimeConfig.vueLlm = {
      openaiApiKey: '',
      anthropicApiKey: '',
      ...nuxt.options.runtimeConfig.vueLlm as Record<string, string>,
    }
  },
})
