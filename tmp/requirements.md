# Locus Agent 需求讨论记录

## 技术栈

前端：Vue 3.5 + Pinia + Pinia Colada + Markstream-vue
后端：Bun + Hono + Vercel AI SDK
存储：SQLite (bun:sqlite) + Drizzle ORM

选型理由：
- Hono 的 SSE 支持比 Elysia 稳定（Elysia/Bun 的 SSE 有已知 bug）
- Pinia Colada 处理请求缓存，类似 TanStack Query
- Markstream-vue 专门做流式 markdown 渲染，支持打字机效果和 mermaid
- Drizzle 类型安全 + SQL-first，配合 bun:sqlite 零依赖

## MVP 功能

最小可用版本只做两件事：
1. 对话界面
2. Bash 工具执行

后续再迭代加功能。

## 架构方向

通信：前后端用 SSE 做流式传输

Agent Loop：
- 用 AI SDK 的 streamText + tools
- 循环检查 finishReason，tool-calls 就执行工具、结果塞回 messages，继续循环

Bash 执行安全：
- 提供开关：确认模式（每次执行前用户确认）/ Yolo 模式（直接执行）

会话持久化：
- conversations 表：会话列表
- messages 表：消息历史，包含 tool_calls / tool_results
