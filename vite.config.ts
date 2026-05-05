import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Recharts + d3 子模块独立 chunk —— 只在 Analytics 页加载
          recharts: ['recharts'],
          // Supabase SDK 独立 —— 已登录用户首屏需要,但拆出来便于缓存
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
