# @univedge/locus-cli

Locus Agent 的命令行工具：在后台启动内置 Web + API 服务、交互式配置 LLM（提供商、API Key、模型、端口）等。

## 安装

```bash
pnpm add -g @univedge/locus-cli
# 或
npm install -g @univedge/locus-cli
```

## 使用

根命令需指定子命令，例如：

```bash
locus --help
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `locus start` | 后台启动 Locus Agent（默认端口 3000） |
| `locus start --port 4000` | 指定端口启动 |
| `locus config` | 交互式重新配置 LLM 与监听端口 |
| `locus stop` | 停止当前后台进程 |

首次启动前建议先执行 `locus config` 完成 LLM 提供商、API Key、模型与端口等设置。

## 数据目录

配置与本地数据默认位于：`~/.local/share/locus-agent/`。

## 从本仓库开发 / 本地链接

在 monorepo 内构建并全局链接后，可在任意目录使用 `locus` 命令，步骤见仓库根目录 [README.md](https://github.com/ShenQingchuan/locus-agent/blob/main/README.md#本地安装并测试-locus-命令)。

## License

MIT
