import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import WebLLMPlayground from './WebLLMPlayground.vue'
import GenerativeUIDemo from './generative-ui/GenerativeUIDemo.vue'
import ChatUIDemo from './chat-ui/ChatUIDemo.vue'
import TokenStreamHero from './TokenStreamHero.vue'
import HeroChat from './home/HeroChat.vue'
import HeroBadge from './home/HeroBadge.vue'
import HeroInstall from './home/HeroInstall.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'home-hero-info-before': () => h(HeroBadge),
    'home-hero-actions-after': () => h(HeroInstall),
    'home-hero-image': () => h(HeroChat),
  }),
  enhanceApp({ app }) {
    app.component('WebLLMPlayground', WebLLMPlayground)
    app.component('GenerativeUIDemo', GenerativeUIDemo)
    app.component('ChatUIDemo', ChatUIDemo)
    app.component('TokenStreamHero', TokenStreamHero)
  },
} satisfies Theme
