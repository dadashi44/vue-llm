import { defineConfig, type HeadConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { writeLLMsFiles } from './llms'
import { writeRegistry } from './registry'
import { LOCALES, LOCALE_KEYS, localePrefix, localesConfig, searchLocales, splitLocale } from './locales'

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

// Public URL of the site. Change it here (and `base`) when moving to an org or a custom domain.
const SITE_URL = 'https://vue-llm.js.org/'
const BASE = '/'
const REPO_URL = 'https://github.com/dadashi44/vue-llm'
const TITLE = 'vue-llm'
const DESCRIPTION = LOCALES.root.description

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
    // ICO and PNG for browsers that don't show SVG favicons (Safari), SVG for the rest
    ['link', { rel: 'icon', href: `${BASE}favicon.ico`, sizes: '48x48' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${BASE}favicon-32x32.png` }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}logo.svg` }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${BASE}apple-touch-icon.png` }],
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
  locales: localesConfig(REPO_URL),
  // Per-page canonical URL, language alternates and social metadata
  transformPageData(pageData) {
    const { key, path: localPath } = splitLocale(pageData.relativePath)
    const slug = localPath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
    const strings = LOCALES[key]
    const url = SITE_URL + localePrefix(key) + slug
    const title = pageData.frontmatter.layout === 'home' ? `${TITLE} — ${strings.homeTitle}` : `${pageData.title} | ${TITLE}`
    const description = pageData.frontmatter.description || pageData.description || strings.description
    const head: HeadConfig[] = [
      ['link', { rel: 'canonical', href: url }],
      ...LOCALE_KEYS.map((k): HeadConfig => ['link', { rel: 'alternate', hreflang: LOCALES[k].lang, href: SITE_URL + localePrefix(k) + slug }]),
      ['link', { rel: 'alternate', hreflang: 'x-default', href: SITE_URL + slug }],
      ['meta', { property: 'og:locale', content: strings.ogLocale }],
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
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: REPO_URL }],
    search: { provider: 'local', options: { locales: searchLocales() } },
  },
})
