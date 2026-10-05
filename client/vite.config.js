import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

/**
 * 빌드 식별자 — 배포마다 바뀌는 값.
 * Vercel 빌드면 커밋 SHA, 아니면 빌드 시각을 쓴다. 열린 탭은 번들에 박힌 이 값과
 * 서버의 /version.json 값을 비교해 새 배포를 알아챈다(client/src/lib/deployWatcher.js).
 */
function resolveBuildId() {
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim()
  if (sha) return sha
  return `build-${new Date().toISOString().replace(/[^0-9]/g, '')}`
}

/** dist/version.json을 내보낸다. 번들의 __APP_BUILD_ID__와 같은 값이다. */
function buildVersionFile(buildId) {
  return {
    name: 'cw-build-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ buildId, builtAt: new Date().toISOString() })}\n`,
      })
    },
  }
}

export default defineConfig(({ command }) => {
  // dev 서버는 'dev'로 둔다. 감시 장치는 이 값이거나 DEV 모드면 꺼진다.
  const buildId = command === 'build' ? resolveBuildId() : 'dev'

  return {
    plugins: [react(), tailwindcss(), buildVersionFile(buildId)],
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: {
        'curriculum-weaver-shared': path.resolve(__dirname, '../shared'),
      },
    },
    server: {
      port: 4006,
      proxy: {
        '/api': {
          target: 'http://localhost:4007',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:4007',
          ws: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-graph': ['react-force-graph-2d'],
            'vendor-three': ['three'],
            'vendor-graph3d': ['react-force-graph-3d'],
          },
        },
      },
    },
  }
})
