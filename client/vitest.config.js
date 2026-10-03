import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { 'curriculum-weaver-shared': path.resolve(import.meta.dirname, '../shared') } },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/__tests__/**/*.test.{js,jsx}'],
    testTimeout: 10_000,
  },
})
