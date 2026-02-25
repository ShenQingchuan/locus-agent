import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'drizzle-kit'

const xdgData = join(homedir(), '.local', 'share')
const dbPath = join(xdgData, 'locus-agent', 'locus.db')

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
})
