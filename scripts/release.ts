#!/usr/bin/env bun
/**
 * Release 脚本：统一版本号、生成 Changelog、打 Git tag、创建 GitHub Release。
 *
 * 依赖：git-cliff（pnpm 已装）、GitHub CLI (gh) 已登录。
 *
 * 用法：
 *   bun scripts/release.ts [版本号]   # 默认 0.1.0
 *   bun scripts/release.ts 0.1.0 --dry-run   # 仅改版本与生成 notes，不 commit/tag/release
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = join(__dirname, '..')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const version = args.find(a => !a.startsWith('--')) ?? '0.1.0'

const tag = version.startsWith('v') ? version : `v${version}`

const packageJsonPaths = [
  join(root, 'package.json'),
  join(root, 'packages', 'agent-sdk', 'package.json'),
  join(root, 'packages', 'ui', 'package.json'),
  join(root, 'packages', 'plugin-kit', 'package.json'),
  join(root, 'apps', 'web', 'package.json'),
  join(root, 'apps', 'server', 'package.json'),
  join(root, 'apps', 'cli', 'package.json'),
]

function bumpVersions(): void {
  for (const p of packageJsonPaths) {
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf-8'))
      pkg.version = version
      writeFileSync(p, `${JSON.stringify(pkg, null, 2)}\n`)
      console.log(`  ${p.replace(root, '.')} -> ${version}`)
    }
    catch (e) {
      console.warn(`  skip ${p}: ${e}`)
    }
  }
}

function generateChangelog(): void {
  const outFile = join(root, 'RELEASE_NOTES.md')
  execSync(`pnpm exec git cliff --tag ${tag} -o "${outFile}"`, {
    cwd: root,
    stdio: 'inherit',
  })
  console.log(`  Changelog written to RELEASE_NOTES.md`)
}

/** 暂停：等待用户查看/编辑 RELEASE_NOTES.md 后按 Enter 继续 */
function waitForReview(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    console.log('\n  请查看/编辑 RELEASE_NOTES.md，确认后按 Enter 继续...')
    process.stdin.once('data', () => {
      process.stdin.pause()
      resolve()
    })
  })
}

const RE_LEADING_DOT_SLASH = /^\.\//
function gitCommitAndTag(): void {
  const files = packageJsonPaths.filter(p => existsSync(p))
    .map(p => p.replace(root, '.').replace(RE_LEADING_DOT_SLASH, ''))
    .join(' ')
  execSync(`git add ${files} RELEASE_NOTES.md`, { cwd: root, stdio: 'inherit' })
  execSync(`git commit -m "chore(release): ${tag}"`, { cwd: root, stdio: 'inherit' })
  execSync(`git tag ${tag}`, { cwd: root, stdio: 'inherit' })
  console.log(`  Committed and tagged ${tag}`)
}

function createGitHubRelease(): void {
  const notesFile = join(root, 'RELEASE_NOTES.md')
  execSync(`gh release create ${tag} --notes-file "${notesFile}"`, {
    cwd: root,
    stdio: 'inherit',
  })
  console.log(`  GitHub Release created: ${tag}`)
}

async function main(): Promise<void> {
  console.log(`Release ${tag} (dryRun=${dryRun})\n`)

  console.log('1. Bumping versions in package.json...')
  bumpVersions()

  console.log('\n2. Generating changelog (git-cliff)...')
  generateChangelog()

  console.log('\n3. 暂停：请查看/编辑 RELEASE_NOTES.md')
  await waitForReview()

  if (dryRun) {
    console.log('\n[dry-run] Skip git commit, tag, and gh release.')
    return
  }

  console.log('\n4. Git commit and tag...')
  gitCommitAndTag()

  console.log('\n5. Creating GitHub Release...')
  createGitHubRelease()

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
