import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { vue2SFC } from './scripts/vite-plugin-vue2-sfc'

// `vue-llm/components/vue2`: the same component sources compiled for Vue 2.7
export default defineConfig({
  plugins: [
    vue2SFC(),
    {
      name: 'vue-llm:vue2-types',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'components.d.ts', source: readFileSync(resolve(__dirname, 'types/vue2/components.d.ts'), 'utf8') })
      },
    },
  ],
  build: {
    outDir: 'dist/vue2',
    lib: {
      entry: { components: resolve(__dirname, 'src/components.ts') },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue'],
    },
  },
})
