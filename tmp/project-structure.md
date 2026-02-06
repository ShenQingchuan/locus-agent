# 项目结构

Monorepo，用 pnpm workspace。

```
apps/
  server/              # Hono 后端
  web/                 # Vue 前端
packages/
  shared/              # 共享类型
  llm-msg-components/  # LLM 消息渲染组件
```
