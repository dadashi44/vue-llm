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
import ConsentBanner from './ConsentBanner.vue'
import { initAnalytics, track, trackPageView } from './analytics'
import './style.css'

const LOCALES = ['ru', 'zh', 'pt', 'es', 'ja']
const localeOf = (path: string): string => LOCALES.find(l => path.startsWith(`/vue-llm/${l}/`)) ?? 'en'

/** Outbound links and code copies, tracked with one listener for the whole site */
function trackClicks(event: MouseEvent): void {
  const target = event.target as Element | null

  const link = target?.closest('a[href^="http"]') as HTMLAnchorElement | null
  if (link && new URL(link.href).hostname !== location.hostname) {
    track('outbound_click', { host: new URL(link.href).hostname, url: link.href })
    return
  }

  // VitePress code blocks have a copy button next to the <pre>
  const copy = target?.closest('button.copy')
  if (copy) {
    const code = copy.parentElement?.querySelector('pre')?.textContent?.trim() ?? ''
    const kind = code.includes('shadcn-vue') ? 'shadcn_add' : /^(npm|pnpm|yarn|bun)\b/.test(code) ? 'install' : 'code'
    track('copy_code', { kind, snippet: code.slice(0, 80) })
  }
}

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'home-hero-info-before': () => h(HeroBadge),
    'home-hero-actions-after': () => h(HeroInstall),
    'home-hero-image': () => h(HeroChat),
    'layout-bottom': () => h(ConsentBanner),
  }),
  enhanceApp({ app, router }) {
    app.component('WebLLMPlayground', WebLLMPlayground)
    app.component('GenerativeUIDemo', GenerativeUIDemo)
    app.component('ChatUIDemo', ChatUIDemo)
    app.component('TokenStreamHero', TokenStreamHero)

    if (typeof window === 'undefined') return
    initAnalytics()
    document.addEventListener('click', trackClicks, { capture: true })

    let previous = location.pathname
    router.onAfterRouteChange = (to) => {
      trackPageView()
      const from = localeOf(previous)
      const next = localeOf(to)
      if (from !== next) track('language_change', { from, to: next })
      previous = to
    }
  },
} satisfies Theme
