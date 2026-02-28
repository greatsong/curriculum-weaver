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
    port: 4006,
    proxy: {
      '/api': {
        target: 'http://localhost:4007',
        changeOrigin: true,
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
        },
      },
    },
  },
})
