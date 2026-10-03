import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { 'curriculum-weaver-shared': path.resolve(import.meta.dirname, '../shared') } },
  test: {
    environment: 'node',
    globals: false,
    include: ['**/__tests__/**/*.test.js'],
    testTimeout: 15_000,
    // 병렬 실행 부하에서 beforeAll의 지연 import가 기본 10초를 넘겨 materials.test.js가 간헐 실패했다
    hookTimeout: 30_000,
  },
})
