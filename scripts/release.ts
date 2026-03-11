#!/usr/bin/env bun
/**
 * Release 脚本：统一版本号、生成 Changelog、打 tag、推送、构建、发布 npm、创建 GitHub Release。
 *
 * 依赖：git-cliff、GitHub CLI (gh) 已登录、远程 origin 已配置、已登录 npm（npm login）。
 * 仅会发布 package.json 中未设置 "private": true 的包（当前为 @univedge/locus-agent-sdk、@univedge/locus-cli）。
 * 首次发布作用域包需在 package.json 中配置 "publishConfig": { "access": "public" } 或单次使用 pnpm publish --access public。
 *
 * 用法：
 *   bun scripts/release.ts --bump          # patch: 0.1.2 -> 0.1.3
 *   bun scripts/release.ts --minor         # minor: 0.1.2 -> 0.2.0
 *   bun scripts/release.ts --major         # major: 0.1.2 -> 1.0.0
 *   bun scripts/release.ts --bump --dry    # dry-run，不 commit/tag/push/build/publish/release
 *   bun scripts/release.ts 0.2.0           # 直接指定版本号
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = join(__dirname, '..')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry')

function resolveVersion(): string {
  const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
  const current: string = rootPkg.version ?? '0.0.0'
  const [major, minor, patch] = current.split('.').map(Number)

  if (args.includes('--major'))
    return `${major + 1}.0.0`
  if (args.includes('--minor'))
    return `${major}.${minor + 1}.0`
  if (args.includes('--bump') || args.includes('--patch'))
    return `${major}.${minor}.${patch + 1}`

  // 支持直接传版本号
  const explicit = args.find(a => !a.startsWith('--'))
  if (explicit)
    return explicit

  console.error('请指定版本升级方式: --bump (patch), --minor, --major, 或直接传入版本号')
  process.exit(1)
}

const version = resolveVersion()
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

  // 只生成尚未 tag 的新提交的 changelog，并标记为当前版本
  const newChangelog = execSync(`pnpm exec git cliff --unreleased --tag ${tag}`, {
    cwd: root,
    encoding: 'utf-8',
  })

  // 读取现有的历史 changelog（如果存在）
  let existingChangelog = ''
  if (existsSync(outFile)) {
    existingChangelog = readFileSync(outFile, 'utf-8')
  }

  // 新内容插入顶部，保留原有历史
  const combined = existingChangelog
    ? `${newChangelog.trimEnd()}\n\n${existingChangelog}`
    : newChangelog

  writeFileSync(outFile, combined)
  console.log(`  Changelog prepended to RELEASE_NOTES.md`)
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

function pushCommitAndTag(): void {
  execSync(`git push origin HEAD ${tag}`, { cwd: root, stdio: 'inherit' })
  console.log(`  Pushed commit and tag ${tag} to origin`)
}

function buildPackages(): void {
  execSync('pnpm build', { cwd: root, stdio: 'inherit' })
  console.log('  Build done')
}

function publishToNpm(): void {
  execSync('pnpm -r publish --no-git-checks', { cwd: root, stdio: 'inherit' })
  console.log('  Published to npm (only packages without "private": true)')
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

  console.log('\n5. Push to origin (commit + tag)...')
  pushCommitAndTag()

  console.log('\n6. Build (for npm publish)...')
  buildPackages()

  console.log('\n7. Publish to npm...')
  publishToNpm()

  console.log('\n8. Creating GitHub Release...')
  createGitHubRelease()

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
