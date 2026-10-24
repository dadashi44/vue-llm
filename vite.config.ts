import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

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
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['vue', '@nuxt/kit'],
      output: {
        globals: { vue: 'Vue' },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.spec.ts'],
  },
})
