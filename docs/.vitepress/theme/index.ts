import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import WebLLMPlayground from './WebLLMPlayground.vue'
import GenerativeUIDemo from './generative-ui/GenerativeUIDemo.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('WebLLMPlayground', WebLLMPlayground)
    app.component('GenerativeUIDemo', GenerativeUIDemo)
  },
} satisfies Theme
