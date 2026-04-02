// @ts-check

import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  ignores: [
    '**/dist',
    '**/node_modules',
    '.agents/**/*.md',
    '.claude/**/*.md',
  ],
}, {
  // Prevent web app from importing server internals
  files: ['apps/web/src/**/*.{ts,vue}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        '@univedge/locus-server*',
        '../../../apps/server/*',
        '../../server/*',
      ],
    }],
  },
})
