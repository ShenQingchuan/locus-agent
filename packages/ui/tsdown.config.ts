import { defineConfig } from 'tsdown'
import Vue from 'unplugin-vue/rolldown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'neutral',
  outExtensions: () => ({ js: '.js' }),
  dts: { vue: true },
  clean: true,
  deps: {
    neverBundle: ['vue', '@vueuse/core', '@tanstack/vue-virtual'],
  },
  plugins: [
    Vue({ isProduction: true }),
  ],
})
