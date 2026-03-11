# 发布流程

本仓库通过一条脚本完成：统一版本号、生成 Changelog、打 tag、推送、构建、**发布到 npm**、创建 GitHub Release。

## 前置条件

- 已安装 [GitHub CLI](https://cli.github.com/) 并完成 `gh auth login`
- 本地 `pnpm install` 已执行（含 devDependency `git-cliff`）
- 当前分支已配置远程 `origin`
- 已登录 npm（`npm login` 或 `pnpm login`），以便脚本执行 `pnpm -r publish`
- 首次发布作用域包（`@univedge/xxx`）时，需在对应 `package.json` 中加 `"publishConfig": { "access": "public" }`，或单次执行 `pnpm publish --access public`

## 发布 v0.1.0（或任意版本）

**推荐先试跑（不提交、不打 tag、不建 Release）：**

```bash
pnpm release:dry
# 或指定版本
pnpm release:dry 0.2.0
```

确认 `package.json` 版本与 `CHANGELOG.md` 无误后，再执行正式发布：

```bash
pnpm release
# 或指定版本，默认 0.1.0
pnpm release 0.1.0
```

脚本会依次：

1. 将所有 `package.json`（根目录、packages/*、apps/*）的 `version` 设为指定版本
2. 使用 git-cliff 生成 `RELEASE_NOTES.md`（仅当前版本的变更内容，不含版本标题）
3. **暂停**：提示你查看/编辑 `RELEASE_NOTES.md`，确认后按 Enter 继续
4. 将确认后的 `RELEASE_NOTES.md` 加上版本标题（`## [x.y.z] - yyyy-mm-dd`），插入 `CHANGELOG.md` 顶部
5. 执行 `git add`（含 `CHANGELOG.md` 与各 `package.json`）、`git commit`、`git tag vX.Y.Z`
6. 执行 `git push origin HEAD vX.Y.Z`，将提交与 tag 推送到远程
7. 执行 `pnpm build`，构建各包（供 npm 发布用）
8. 执行 `pnpm -r publish --no-git-checks`，将**未设置 "private": true** 的包发布到 npm（当前为 `@univedge/locus-agent-sdk`、`@univedge/locus-cli`）
9. 执行 `gh release create vX.Y.Z --notes-file RELEASE_NOTES.md`，创建 GitHub Release

`CHANGELOG.md` 纳入版本库（会被 commit），作为累积的 Changelog 记录。`RELEASE_NOTES.md` 仅用于 GitHub Release 说明（不提交到 Git，已加入 `.gitignore`）；你只需在暂停步骤中审阅一次 `RELEASE_NOTES.md` 即可。

## 发布中断后的恢复

若脚本在 **步骤 6～9** 任一步报错，而本地已有 release 提交和 tag，可按需补跑：

```bash
# 仅未推送时
git push origin HEAD v0.1.0

# 仅未发 npm 时（先构建）
pnpm build
pnpm -r publish --no-git-checks

# 仅未建 GitHub Release 时
gh release create v0.1.0 --notes-file RELEASE_NOTES.md  # 需先确认该文件仍存在
```

若想放弃本次发布、撤销本地 commit 与 tag（未 push 时）：

```bash
git tag -d v0.1.0
git reset --soft HEAD~1
```

## 工具说明

| 工具 | 作用 |
|------|------|
| [git-cliff](https://git-cliff.org) | 按 Git 历史与 `cliff.toml` 规则生成 Changelog，支持 Conventional Commits 与自定义规则 |
| [GitHub CLI (gh)](https://cli.github.com) | 创建 Git tag 与 GitHub Release，并把生成的说明写入 Release 页面 |
| pnpm -r publish | 将 workspace 中未标记 private 的包发布到 npm |
