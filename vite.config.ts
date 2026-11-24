import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        providers: resolve(__dirname, 'src/providers.ts'),
        components: resolve(__dirname, 'src/components.ts'),
        nuxt: resolve(__dirname, 'src/nuxt.ts'),
        server: resolve(__dirname, 'src/server.ts'),
        devtools: resolve(__dirname, 'src/devtools.ts'),
        mcp: resolve(__dirname, 'src/mcp.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['vue', '@nuxt/kit', '@vue/devtools-api', 'node:dns'],
      output: {
        globals: { vue: 'Vue' },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.spec.ts'],
    // Vue 2.7 component specs run under `npm run test:vue2`
    exclude: [...configDefaults.exclude, 'test/components-vue2/**'],
  },
})
