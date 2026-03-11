# @univedge/locus-cli

Locus Agent 的命令行工具，提供本地开发服务器启动、交互式配置（LLM / MCP）等功能。

## 安装

```bash
npm install -g @univedge/locus-cli
```

## 使用

```bash
# 交互式配置 LLM 提供商和 API Key
locus config

# 启动本地开发服务器（同时启动 Web 和 Server）
locus
```

## 功能

- **交互式配置** — 通过命令行向导完成 LLM 模型、API Key、MCP 服务器等设置
- **本地开发服务器** — 一键启动 Web + Server，支持 HMR 热更新
- **工作区管理** — 自动检测并管理项目工作区

## License

MIT
