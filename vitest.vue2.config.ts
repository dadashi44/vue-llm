import { defineConfig } from 'vitest/config'

// Runs the framework-level specs against Vue 2.7 (aliased as `vue2`); component specs are Vue 3 only
export default defineConfig({
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
