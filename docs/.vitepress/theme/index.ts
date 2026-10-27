import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import WebLLMPlayground from './WebLLMPlayground.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('WebLLMPlayground', WebLLMPlayground)
  },
} satisfies Theme
