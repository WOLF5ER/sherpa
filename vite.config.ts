import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// base './' — сборка открывается и из браузера, и из лаунчера (pywebview) по относительным путям
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 4879,
    strictPort: true,
    watch: { ignored: ['**/launcher/**', '**/dist/**'] },
    // TarkovTracker не отдаёт CORS сторонним сайтам и требует User-Agent — ходим через прокси
    proxy: {
      '/api/tt': {
        target: 'https://api.tarkovtracker.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/tt/, ''),
        headers: { 'User-Agent': 'Sherpa/1.0 (+https://github.com/sherpa-tarkov)' },
      },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
})
