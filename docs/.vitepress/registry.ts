import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface RegistryOptions {
  /** Directory with the component sources, e.g. `registry/` */
  registryDir: string
  outDir: string
  homepage: string
}

const ITEMS = [
  {
    name: 'chat',
    title: 'Chat',
    description: 'A complete AI chat for vue-llm useChat: streaming Markdown, reasoning, tool calls, Generative UI, attachments and auto-scroll.',
    dir: 'chat',
    dependencies: ['vue-llm', '@lucide/vue'],
  },
]

/**
 * Writes a shadcn-vue registry (`r/registry.json` and `r/<item>.json`), so components can be added with
 * `npx shadcn-vue add <homepage>r/chat.json`. Files keep their sources; the CLI rewrites `@/` aliases.
 */
export async function writeRegistry({ registryDir, outDir, homepage }: RegistryOptions): Promise<void> {
  const target = join(outDir, 'r')
  await mkdir(target, { recursive: true })

  const items = await Promise.all(ITEMS.map(async (item) => {
    const names = (await readdir(join(registryDir, item.dir))).filter(f => /\.(vue|ts)$/.test(f)).sort()
    const files = await Promise.all(names.map(async name => ({
      path: `ui/${item.dir}/${name}`,
      content: await readFile(join(registryDir, item.dir, name), 'utf8'),
      type: 'registry:ui' as const,
    })))
    return {
      $schema: 'https://shadcn-vue.com/schema/registry-item.json',
      name: item.name,
      type: 'registry:ui' as const,
      title: item.title,
      description: item.description,
      dependencies: item.dependencies,
      files,
    }
  }))

  for (const item of items) {
    await writeFile(join(target, `${item.name}.json`), JSON.stringify(item, null, 2))
  }

  await writeFile(join(target, 'registry.json'), JSON.stringify({
    $schema: 'https://shadcn-vue.com/schema/registry.json',
    name: 'vue-llm',
    homepage,
    items: items.map(({ $schema: _schema, files, ...item }) => ({
      ...item,
      files: files.map(({ content: _content, ...file }) => file),
    })),
  }, null, 2))
}
