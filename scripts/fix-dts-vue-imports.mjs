// vue-tsc keeps `./Foo.vue` specifiers in emitted declarations. Under
// moduleResolution "node16"/"nodenext" TypeScript only finds the emitted
// `Foo.vue.d.ts` through `./Foo.vue.js`, which `bundler` resolves as well.
// See https://github.com/dadashi44/vue-llm/issues/25
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

for (const file of walk(dist).filter(f => f.endsWith('.d.ts'))) {
  const source = readFileSync(file, 'utf8')
  const fixed = source.replace(/(from\s+['"]\.{1,2}\/[^'"]+\.vue)(['"])/g, '$1.js$2')
  if (fixed !== source) writeFileSync(file, fixed)
}
