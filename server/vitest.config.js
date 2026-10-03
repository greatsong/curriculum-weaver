import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { 'curriculum-weaver-shared': path.resolve(import.meta.dirname, '../shared') } },
  test: {
    environment: 'node',
    globals: false,
    include: ['**/__tests__/**/*.test.js'],
    testTimeout: 15_000,
  },
})
