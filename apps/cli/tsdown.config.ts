import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  outExtensions: () => ({ js: '.js' }),
  clean: true,
  sourcemap: false,
  minify: false,
  external: [
    '@huggingface/transformers',
    'onnxruntime-node',
    'better-sqlite3',
  ],
  banner: { js: '#!/usr/bin/env node' },
})
