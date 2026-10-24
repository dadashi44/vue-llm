import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'vue-llm': resolve(__dirname, '../src/index.ts'),
      'vue-llm/providers': resolve(__dirname, '../src/providers.ts'),
      'vue-llm/components': resolve(__dirname, '../src/components.ts'),
    },
  },
  root: __dirname,
  server: {
    port: 4200,
  },
})
