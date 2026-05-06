import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
