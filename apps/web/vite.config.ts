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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // js-tiktoken BPE 字典 (~5MB)，异步加载不阻塞首屏
          if (id.includes('node_modules/js-tiktoken')) {
            return 'vendor-tiktoken'
          }
          // mermaid + 其依赖 (d3, dagre, cytoscape, elkjs 等) 单独拆分
          if (id.includes('node_modules/mermaid') || id.includes('node_modules/d3') || id.includes('node_modules/dagre') || id.includes('node_modules/cytoscape') || id.includes('node_modules/elkjs')) {
            return 'vendor-mermaid'
          }
          // prosekit + prosemirror (仅 MemoriesView 使用)
          if (id.includes('node_modules/prosekit') || id.includes('node_modules/prosemirror') || id.includes('node_modules/@prosekit')) {
            return 'vendor-prosekit'
          }
        },
      },
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
