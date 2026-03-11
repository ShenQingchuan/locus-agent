# @univedge/locus-plugin-kit

Locus Agent 的插件开发工具包，提供插件定义、注册、Hook 事件分发与决策处理等能力。

## 安装

monorepo 内部包，由 `pnpm-workspace.yaml` 管理：

```jsonc
// package.json
{
  "dependencies": {
    "@univedge/locus-plugin-kit": "workspace:*"
  }
}
```

## 功能

- **插件定义** — `definePlugin()` 声明式 API 定义插件清单与 Hook 处理器
- **Hook 事件总线** — 基于 `@univedge/locus-agent-sdk` 的事件模型实现分发
- **决策处理** — 将多个 Hook 返回的决策（block / require_confirmation / append_context 等）合并执行
- **插件注册中心** — 管理插件的加载、卸载与作用域隔离

## License

MIT
