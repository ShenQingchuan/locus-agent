import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { DevTools } from '@vitejs/devtools'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

// Run `ANALYZE=true pnpm build` then open the DevTools URL printed in the
// terminal to inspect chunk treemap, module graph, duplicate packages, etc.
const isAnalyze = process.env.ANALYZE === 'true'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  devtools: isAnalyze ? { enabled: true } : undefined,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    Vue(),
    UnoCSS(),
    DevTools(),
  ],
  resolve: {
    conditions: ['dev'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      // katex is loaded from CDN (see index.html). setKatexLoader() in main.ts
      // redirects markstream-vue to use window.katex, so the internal import("katex")
      // is never executed. Marking external prevents Rollup from bundling it at all.
      external: ['katex'],
      output: {
        manualChunks(id) {
          // js-tiktoken BPE dictionary (~5MB), async load to not block first paint
          if (id.includes('node_modules/js-tiktoken')) {
            return 'vendor-tiktoken'
          }
          // mermaid + its deps (d3, dagre, cytoscape, elkjs, etc.)
          if (id.includes('node_modules/mermaid') || id.includes('node_modules/d3') || id.includes('node_modules/dagre') || id.includes('node_modules/cytoscape') || id.includes('node_modules/elkjs')) {
            return 'vendor-mermaid'
          }
          // prosekit + prosemirror (used only by MemoriesView)
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
