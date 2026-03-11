# 发布流程

本仓库使用 **git-cliff** 生成 Changelog、**GitHub CLI (gh)** 创建 Release，通过一条脚本完成：统一版本号、生成说明、打 tag、创建 GitHub Release。

## 前置条件

- 已安装 [GitHub CLI](https://cli.github.com/) 并完成 `gh auth login`
- 本地 `pnpm install` 已执行（含 devDependency `git-cliff`）
- 当前分支已配置远程 `origin`（脚本会在打 tag 后执行 `git push`，再创建 Release）

## 发布 v0.1.0（或任意版本）

**推荐先试跑（不提交、不打 tag、不建 Release）：**

```bash
pnpm release:dry
# 或指定版本
pnpm release:dry 0.2.0
```

确认 `package.json` 版本与 `RELEASE_NOTES.md` 无误后，再执行正式发布：

```bash
pnpm release
# 或指定版本，默认 0.1.0
pnpm release 0.1.0
```

脚本会依次：

1. 将所有 `package.json`（根目录、packages/*、apps/*）的 `version` 设为指定版本  
2. 使用 git-cliff 根据 Git 历史生成 `RELEASE_NOTES.md`（受 `cliff.toml` 配置影响）  
3. **暂停**：提示你查看/编辑 `RELEASE_NOTES.md`，确认后按 Enter 继续  
4. 执行 `git add`（含 `RELEASE_NOTES.md` 与各 `package.json`）、`git commit`、`git tag vX.Y.Z`  
5. 执行 `git push origin HEAD vX.Y.Z`，将提交与 tag 推送到远程（避免 gh 报「tag 未推送」）  
6. 执行 `gh release create vX.Y.Z --notes-file RELEASE_NOTES.md`，在 GitHub 上创建 Release 并填入 Changelog  

`RELEASE_NOTES.md` 纳入版本库（会被 commit），作为当次发布的 Changelog 记录；你可在暂停步骤中修改后再继续。

## 发布中断后的恢复

若脚本在 **步骤 5 或 6** 报错（例如网络问题、或曾手动打过同版本 tag），而本地已有 release 提交和 tag，可手动补推并建 Release：

```bash
git push origin HEAD v0.1.0
gh release create v0.1.0 --notes-file RELEASE_NOTES.md
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
