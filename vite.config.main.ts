import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    outDir: 'dist/main',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron', 'path', 'fs', 'fs/promises', 'os', 'child_process', 'crypto', 'node-ssh', 'electron-store'],
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
