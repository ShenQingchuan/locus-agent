# @univedge/locus-server

Locus Agent 的后端服务，基于 Hono + Bun 构建，提供 AI Agent 循环、多模型接入、MCP 工具扩展、SQLite 持久化等核心能力。

## 功能

- **多模型 AI Agent 循环** — 支持 OpenAI、Anthropic、DeepSeek、Moonshot、OpenRouter 等提供商
- **内置工具系统** — 文件读写、命令执行、代码搜索等，直接作用于工作区
- **MCP 集成** — 动态接入 MCP 服务器，按需扩展工具能力
- **插件系统** — 基于 Hook 事件模型的插件生命周期管理
- **上下文管理** — 自动压缩、Tool Result Cache、Prompt 组装
- **嵌入向量** — 本地 Embedding 模型，支持语义搜索和知识库

## 开发

```bash
# 在 monorepo 根目录
pnpm dev:server
```

## License

MIT
