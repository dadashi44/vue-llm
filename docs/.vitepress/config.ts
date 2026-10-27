import { defineConfig, type HeadConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { writeLLMsFiles } from './llms'
import { writeRegistry } from './registry'

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

// Public URL of the site. Change it here (and `base`) when moving to an org or a custom domain.
const SITE_URL = 'https://dadashi44.github.io/vue-llm/'
const BASE = '/vue-llm/'
const REPO_URL = 'https://github.com/dadashi44/vue-llm'
const TITLE = 'vue-llm'
const DESCRIPTION = 'Vue composables for AI and LLM apps: streaming useChat, tool calling, Generative UI and in-browser models for OpenAI, Anthropic, Gemini, Ollama and WebGPU. The missing AI SDK for Vue and Nuxt.'

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  'name': TITLE,
  'description': DESCRIPTION,
  'url': SITE_URL,
  'codeRepository': REPO_URL,
  'programmingLanguage': ['TypeScript', 'Vue'],
  'runtimePlatform': ['Browser', 'Node.js', 'Nuxt'],
  'license': 'https://opensource.org/licenses/MIT',
  'keywords': 'vue, nuxt, ai, llm, ai sdk, useChat, streaming, openai, anthropic, gemini, ollama, webgpu, generative ui, tool calling',
  'author': { '@type': 'Person', 'name': 'dadashi44', 'url': 'https://github.com/dadashi44' },
}

export default defineConfig({
  title: TITLE,
  description: DESCRIPTION,
  lang: 'en-US',
  base: BASE,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: SITE_URL },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#42b883' }],
    ['meta', { name: 'keywords', content: structuredData.keywords }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: TITLE }],
    ['meta', { property: 'og:image', content: `${SITE_URL}og.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: `${SITE_URL}og.png` }],
    ['link', { rel: 'alternate', type: 'text/plain', title: 'LLM-friendly docs', href: `${BASE}llms.txt` }],
    ['script', { type: 'application/ld+json' }, JSON.stringify(structuredData)],
  ],
  // Per-page canonical URL and social metadata
  transformPageData(pageData) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
    const url = SITE_URL + path
    const title = pageData.frontmatter.layout === 'home' ? `${TITLE} — the AI SDK for Vue` : `${pageData.title} | ${TITLE}`
    const description = pageData.frontmatter.description || pageData.description || DESCRIPTION
    const head: HeadConfig[] = [
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
    ]
    pageData.frontmatter.head = [...(pageData.frontmatter.head ?? []), ...head]
  },
  async buildEnd(config) {
    await writeLLMsFiles(config.srcDir, config.outDir, { siteUrl: SITE_URL, title: TITLE, description: DESCRIPTION })
    await writeRegistry({ registryDir: root('registry'), outDir: config.outDir, homepage: SITE_URL })
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // Registry components import the package and a shadcn-vue project's `cn` helper
      alias: [
        { find: /^vue-llm\/components$/, replacement: root('src/components.ts') },
        { find: /^vue-llm$/, replacement: root('src/index.ts') },
        { find: /^@\/lib\/utils$/, replacement: root('docs/.vitepress/theme/chat-ui/utils.ts') },
      ],
    },
  },
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
          { text: 'DevTools', link: '/guide/devtools' },
          { text: 'Components', link: '/guide/components' },
          { text: 'Chat UI', link: '/guide/chat-ui' },
        ],
      },
      {
        text: 'Reference',
        items: [{ text: 'API', link: '/api/' }],
      },
    ],
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: REPO_URL }],
    editLink: {
      pattern: 'https://github.com/dadashi44/vue-llm/edit/main/docs/:path',
    },
    search: { provider: 'local' },
    footer: { message: 'Released under the MIT License.' },
  },
})
