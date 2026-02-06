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
})
