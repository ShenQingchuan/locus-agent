import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'db/index': 'src/db/index.ts',
    'config': 'src/config.ts',
    'agent/providers/index': 'src/agent/providers/index.ts',
    'settings/index': 'src/settings/index.ts',
  },
  format: ['esm'],
  platform: 'node',
  outExtensions: () => ({ js: '.js' }),
  clean: true,
  sourcemap: true,
  external: [
    'onnxruntime-node',
    '@huggingface/transformers',
    'better-sqlite3',
  ],
})
