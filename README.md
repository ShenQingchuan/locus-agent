# Locus Agent

![NPM Version](https://img.shields.io/npm/v/%40univedge%2Flocus-cli)

🤖 这就是我想要的 AI 智能助手！

## 快速开始

```bash
pnpm install
pnpm dev
```

## 本地安装并测试 locus 命令

在仓库内构建并链接 CLI，即可在任意目录用 `locus` 启动应用（需已安装 [Bun](https://bun.sh)）：

```bash
pnpm install
pnpm build
cd apps/cli && pnpm link --global
```

之后可执行：

- `locus start` — 后台启动服务（默认 http://localhost:3000）
- `locus start --port 4000` — 指定端口启动
- `locus config` — 交互式配置 LLM（API Key、模型等）
- `locus stop` — 停止后台服务

数据与配置目录：`~/.local/share/locus-agent/`。解除全局链接：`pnpm unlink --global`（在 `apps/cli` 下执行）。

## 开发环境

- **运行时**：Bun
- **包管理**：pnpm
- **配置存储**：`~/.local/share/locus-agent/`（LLM、MCP 等）
