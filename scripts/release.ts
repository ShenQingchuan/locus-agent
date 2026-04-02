#!/usr/bin/env bun
/**
 * Release 脚本：统一版本号、生成 CHANGELOG.md 与 RELEASE_NOTES.md、打 tag、推送、构建、发布 npm、创建 GitHub Release。
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
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

/**
 * Dynamically discover package.json files in workspace.
 * Scans packages/ and apps/ directories for subdirectories containing package.json.
 */
function discoverPackageJsons(): string[] {
  const paths: string[] = [join(root, 'package.json')]

  for (const dir of ['packages', 'apps']) {
    const baseDir = join(root, dir)
    if (!existsSync(baseDir))
      continue

    for (const entry of readdirSync(baseDir)) {
      const pkgPath = join(baseDir, entry, 'package.json')
      if (existsSync(pkgPath)) {
        paths.push(pkgPath)
      }
    }
  }

  return paths
}

const packageJsonPaths = discoverPackageJsons()

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

const RE_VERSION_TITLE = /^## \[[^\]\n]+\][^\n]*\n+/

/** 步骤 2：用 git-cliff 生成 RELEASE_NOTES.md（仅当前版本内容，不含版本标题），供用户审阅 */
function generateReleaseNotes(): void {
  const releaseNotesFile = join(root, 'RELEASE_NOTES.md')

  const newChangelog = execSync(`pnpm exec git cliff --unreleased --tag ${tag}`, {
    cwd: root,
    encoding: 'utf-8',
  })

  // 去掉 "## [x.y.z] - yyyy-mm-dd" 标题行，只保留分类内容
  const releaseNotes = newChangelog
    .replace(RE_VERSION_TITLE, '')
    .trim()
  writeFileSync(releaseNotesFile, `${releaseNotes}\n`)
  console.log(`  Release notes written to RELEASE_NOTES.md`)
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

/** 步骤 4：将用户确认后的 RELEASE_NOTES.md 加上版本标题，插入 CHANGELOG.md 顶部 */
function updateChangelog(): void {
  const changelogFile = join(root, 'CHANGELOG.md')
  const releaseNotesFile = join(root, 'RELEASE_NOTES.md')

  const releaseNotes = readFileSync(releaseNotesFile, 'utf-8').trimEnd()
  const today = new Date().toISOString().slice(0, 10)
  const entry = `## [${version}] - ${today}\n\n${releaseNotes}`

  let existing = ''
  if (existsSync(changelogFile)) {
    existing = readFileSync(changelogFile, 'utf-8')
  }
  const combined = existing
    ? `${entry}\n\n${existing}`
    : `${entry}\n`
  writeFileSync(changelogFile, combined)
  console.log(`  CHANGELOG.md updated`)
}

const RE_LEADING_DOT_SLASH = /^\.\//
function gitCommitAndTag(): void {
  const files = packageJsonPaths.filter(p => existsSync(p))
    .map(p => p.replace(root, '.').replace(RE_LEADING_DOT_SLASH, ''))
    .join(' ')
  execSync(`git add ${files} CHANGELOG.md`, { cwd: root, stdio: 'inherit' })
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

  console.log('\n2. Generating release notes (git-cliff)...')
  generateReleaseNotes()

  console.log('\n3. 暂停：请查看/编辑 RELEASE_NOTES.md')
  await waitForReview()

  if (dryRun) {
    console.log('\n[dry-run] Skip git commit, tag, and gh release.')
    return
  }

  console.log('\n4. Updating CHANGELOG.md...')
  updateChangelog()

  console.log('\n5. Git commit and tag...')
  gitCommitAndTag()

  console.log('\n6. Push to origin (commit + tag)...')
  pushCommitAndTag()

  console.log('\n7. Build (for npm publish)...')
  buildPackages()

  console.log('\n8. Publish to npm...')
  publishToNpm()

  console.log('\n9. Creating GitHub Release...')
  createGitHubRelease()

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
