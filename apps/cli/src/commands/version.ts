import { defineCommand } from 'citty'
import { version } from '../../package.json'

export default defineCommand({
  meta: { name: 'version', description: 'Show current version' },
  run() {
    console.log(version)
  },
})
