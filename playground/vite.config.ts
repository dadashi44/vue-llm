import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: 'vue-llm/providers', replacement: resolve(__dir, '../src/providers.ts') },
      { find: 'vue-llm/components', replacement: resolve(__dir, '../src/components.ts') },
      { find: 'vue-llm', replacement: resolve(__dir, '../src/index.ts') },
    ],
  },
  root: __dir,
  server: {
    port: 4200,
  },
})
