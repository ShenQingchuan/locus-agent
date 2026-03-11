# Locus Agent

![NPM Version](https://img.shields.io/npm/v/%40univedge%2Flocus-cli)

AI 智能助手，支持多模型接入与 MCP 工具扩展。

## 亮点

- **多模型**：OpenAI、Anthropic、Moonshot、OpenRouter 及自定义兼容接口
- **内置工具**：执行命令、读/写/替换文件，直接作用于工作区
- **MCP 扩展**：接入任意 MCP 服务器，按需扩展能力
- **工具审批**：可开启确认模式，逐条审批工具调用后再执行

## 快速开始

```bash
pnpm install
pnpm dev config   # 首次需配置 LLM（API Key、模型等）
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

- `locus` — 后台启动服务（默认 http://localhost:3000）
- `locus config` — 交互式配置 LLM
- `locus stop` — 停止后台服务
- `locus --port 4000` — 指定端口

数据与配置目录：`~/.local/share/locus-agent/`。解除全局链接：`pnpm unlink --global`（在 `apps/cli` 下执行）。

## 开发环境

- **运行时**：Bun
- **包管理**：pnpm
- **配置存储**：`~/.local/share/locus-agent/`（LLM、MCP 等）
