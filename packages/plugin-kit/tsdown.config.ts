import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  outExtensions: () => ({ js: '.js' }),
  dts: true,
  clean: true,
})
