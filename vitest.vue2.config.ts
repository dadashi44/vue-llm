import { defineConfig } from 'vitest/config'
import { vue2SFC } from './scripts/vite-plugin-vue2-sfc'

// Runs the specs against Vue 2.7 (aliased as `vue2`). Components are compiled with the Vue 2.7
// compiler and tested by test/components-vue2; test/components uses Vue 3's test-utils
export default defineConfig({
  plugins: [vue2SFC()],
  resolve: {
    alias: [{ find: /^vue$/, replacement: 'vue2' }],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.spec.ts'],
    exclude: ['test/components/**'],
  },
})
