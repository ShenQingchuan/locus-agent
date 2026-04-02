import { defineCommand, runMain } from 'citty'
import { version } from '../package.json'

const main = defineCommand({
  meta: {
    name: 'locus',
    version,
    description: 'Locus Agent — AI-powered development assistant',
  },
  subCommands: {
    start: () => import('./commands/start.js').then(m => m.default),
    stop: () => import('./commands/stop.js').then(m => m.default),
    config: () => import('./commands/config.js').then(m => m.default),
    daemon: () => import('./commands/daemon.js').then(m => m.default),
  },
})

runMain(main)
