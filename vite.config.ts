import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }).version

// base './' — сборка открывается и из браузера, и из лаунчера (pywebview) по относительным путям
export default defineConfig({
  base: './',
  // версия — из package.json: странице для «о программе», лаунчеру (dist/version.json) для проверки обновлений
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  plugins: [
    react(), tailwindcss(),
    { name: 'sherpa-version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) }) } },
  ],
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
