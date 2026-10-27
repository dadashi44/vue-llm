import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

interface SiteInfo {
  siteUrl: string
  title: string
  description: string
}

interface Page {
  url: string
  title: string
  description: string
  body: string
}

// Reading order for llms-full.txt; pages not listed follow alphabetically
const ORDER = [
  'guide/getting-started',
  'guide/providers',
  'guide/use-chat',
  'guide/tool-calling',
  'guide/generative-ui',
  'guide/in-browser',
  'guide/use-completion',
  'guide/use-object',
]

/**
 * Writes llms.txt (an index) and llms-full.txt (all docs as plain Markdown),
 * so AI assistants and answer engines can read the docs without parsing HTML.
 * See https://llmstxt.org
 */
export async function writeLLMsFiles(srcDir: string, outDir: string, site: SiteInfo): Promise<void> {
  const pages = await loadPages(srcDir, site.siteUrl)

  const index = [
    `# ${site.title}`,
    '',
    `> ${site.description}`,
    '',
    'Install with `npm i vue-llm`. Works with Vue 3.3+ and Nuxt 3/4. Composables also work on Vue 2.7. MIT licensed.',
    '',
    '## Docs',
    '',
    ...pages.map(p => `- [${p.title}](${p.url})${p.description ? `: ${p.description}` : ''}`),
    '',
    '## Optional',
    '',
    `- [Full documentation in one file](${site.siteUrl}llms-full.txt)`,
    '- [Source code](https://github.com/dadashi44/vue-llm)',
    '- [npm package](https://www.npmjs.com/package/vue-llm)',
    '',
  ].join('\n')

  const full = [
    `# ${site.title}`,
    '',
    `> ${site.description}`,
    '',
    ...pages.map(p => `<!-- ${p.url} -->\n\n${p.body.trim()}\n`),
  ].join('\n')

  await writeFile(join(outDir, 'llms.txt'), index)
  await writeFile(join(outDir, 'llms-full.txt'), full)
}

// llms.txt is the English source of truth; translations would only duplicate it
const isTranslation = (file: string): boolean => /^(ru|zh|pt|es|ja)\//.test(file.replace(/\\/g, '/'))

async function loadPages(srcDir: string, siteUrl: string): Promise<Page[]> {
  const files = (await readdir(srcDir, { recursive: true }))
    .filter(f => f.endsWith('.md') && !f.includes('node_modules') && f !== 'index.md' && !isTranslation(f))

  const pages = await Promise.all(files.map(async (file) => {
    const raw = await readFile(join(srcDir, file), 'utf8')
    const { frontmatter, body } = splitFrontmatter(raw)
    const path = relative('.', file).replace(/\\/g, '/').replace(/\.md$/, '').replace(/(^|\/)index$/, '$1')
    const cleaned = body
      .replace(/<ClientOnly>[\s\S]*?<\/ClientOnly>\n*/g, '')
      .replace(/\]\(((?:\.\.?\/|\/)?[\w/-]+)(#[\w-]+)?\)/g, (_match, target: string, hash = '') => {
        // Root-relative links are relative to the site base, not the domain
        const href = target.startsWith('/') ? siteUrl + target.slice(1) : new URL(target, siteUrl + path).href
        return `](${href}${hash})`
      })
    return {
      path,
      url: siteUrl + path,
      title: frontmatter.title ?? /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? path,
      description: frontmatter.description ?? '',
      body: cleaned,
    }
  }))

  const rank = (path: string) => {
    const i = ORDER.indexOf(path)
    return i === -1 ? ORDER.length : i
  }
  return pages
    .sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path))
    .map(({ path: _path, ...page }) => page)
}

function splitFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw)
  if (!match) return { frontmatter: {}, body: raw }
  const frontmatter: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const kv = /^(\w+):\s*(.+)$/.exec(line)
    if (kv) frontmatter[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '')
  }
  return { frontmatter, body: raw.slice(match[0].length) }
}
