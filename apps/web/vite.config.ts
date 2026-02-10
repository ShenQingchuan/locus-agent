import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    Vue(),
    UnoCSS(),
  ],
  resolve: {
    conditions: ['dev'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // HMR connects directly to Vite's port, since browser page is served from Bun (:3000)
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
  },
})
