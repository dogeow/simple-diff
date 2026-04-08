import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: 'index',
    },
    outDir: 'dist/preload',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron'],
    },
    target: 'node20',
    ssr: true,
    minify: false,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
    },
  },
})
