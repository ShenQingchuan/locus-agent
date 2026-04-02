import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'tool-helper': 'src/tool-helper.ts',
    'session': 'src/session.ts',
    'agent': 'src/agent.ts',
    'mcp/index': 'src/mcp/index.ts',
  },
  format: ['esm'],
  platform: 'node',
  outExtensions: () => ({ js: '.js' }),
  dts: true,
  clean: true,
})
