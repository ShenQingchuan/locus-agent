# Locus Agent

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

## 开发环境

- **运行时**：Bun
- **包管理**：pnpm
- **配置存储**：`~/.local/share/locus-agent/`（LLM、MCP 等）
