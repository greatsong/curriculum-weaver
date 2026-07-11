// E2E 테스트 전용 Vite 설정 — 세션 격리용 (기본 4006/4007과 분리)
// 사용: npx vite --config vite.config.e2e.js  (프론트 4031 → 백엔드 4034 프록시)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'curriculum-weaver-shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 4031,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4034',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4034',
        ws: true,
      },
    },
  },
})
