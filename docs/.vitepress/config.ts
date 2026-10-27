import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'vue-llm',
  description: 'AI/LLM composables for Vue — the missing AI SDK for the Vue ecosystem.',
  base: '/vue-llm/',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Playground', link: '/playground' },
      { text: 'API', link: '/api/' },
      { text: 'npm', link: 'https://www.npmjs.com/package/vue-llm' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Providers', link: '/guide/providers' },
          { text: 'In-Browser Models', link: '/guide/in-browser' },
          { text: 'Security', link: '/guide/security' },
        ],
      },
      {
        text: 'Composables',
        items: [
          { text: 'useChat', link: '/guide/use-chat' },
          { text: 'useCompletion', link: '/guide/use-completion' },
          { text: 'useObject', link: '/guide/use-object' },
          { text: 'Tool Calling', link: '/guide/tool-calling' },
          { text: 'Generative UI', link: '/guide/generative-ui' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Attachments', link: '/guide/attachments' },
          { text: 'Persistence', link: '/guide/persistence' },
          { text: 'Prompt Templates', link: '/guide/prompt-templates' },
          { text: 'Middleware', link: '/guide/middleware' },
          { text: 'Retries & Rate Limiting', link: '/guide/retries-rate-limiting' },
        ],
      },
      {
        text: 'Integrations',
        items: [
          { text: 'Server & Proxy', link: '/guide/server' },
          { text: 'Custom Backends', link: '/guide/custom-backends' },
          { text: 'Nuxt', link: '/guide/nuxt' },
          { text: 'Components', link: '/guide/components' },
        ],
      },
      {
        text: 'Reference',
        items: [{ text: 'API', link: '/api/' }],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/dadashi44/vue-llm' }],
    editLink: {
      pattern: 'https://github.com/dadashi44/vue-llm/edit/main/docs/:path',
    },
    search: { provider: 'local' },
    footer: { message: 'Released under the MIT License.' },
  },
})
