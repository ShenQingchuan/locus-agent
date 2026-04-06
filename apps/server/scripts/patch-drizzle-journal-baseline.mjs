/**
 * After `drizzle-kit generate`, journal entries get a large `when` (timestamp).
 * The Bun SQLite migrator skips a migration when the DB's latest __drizzle_migrations.created_at
 * is >= that `when`. For squashed migrations we set `when` to a minimal value so existing DBs
 * skip re-running CREATE TABLE (avoids "table already exists") while empty DBs still run all SQL.
 *
 * Run: pnpm run db:patch-journal-baseline
 * Or: DRIZZLE_BASELINE_WHEN=1 pnpm run db:patch-journal-baseline
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const journalPath = path.join(__dirname, '../drizzle/meta/_journal.json')
const baselineWhen = Number(process.env.DRIZZLE_BASELINE_WHEN ?? 1)

const raw = fs.readFileSync(journalPath, 'utf8')
const journal = JSON.parse(raw)

if (!Array.isArray(journal.entries)) {
  console.error('[patch-drizzle-journal-baseline] invalid _journal.json: missing entries')
  process.exit(1)
}

for (const entry of journal.entries)
  entry.when = baselineWhen

fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8')
console.log(`[patch-drizzle-journal-baseline] set when=${baselineWhen} on ${journal.entries.length} migration(s)`)
