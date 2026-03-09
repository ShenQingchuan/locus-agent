# @locus-agent/agent-sdk

Locus Agent 的共享 SDK 包，提供运行时契约、Hook 事件模型、插件系统契约，以及 SSE 协议、上下文管理、Prompt 组装等可复用组件。

## 安装

monorepo 内部包，由 `pnpm-workspace.yaml` 管理：

```jsonc
// package.json
{
  "dependencies": {
    "@locus-agent/agent-sdk": "workspace:*"
  }
}
```

## 模块概览

```
@locus-agent/agent-sdk
├── types/        # 基础共享类型（message, tool, sse-events, provider, …）
├── runtime/      # Agent 运行时契约（loop, tool, delegation, policy）
├── hooks/        # Hook 事件模型（events, payloads, hook-bus, decisions）
├── plugins/      # 插件系统契约（manifest, permissions, scope）
├── context/      # 上下文管理（auto-compaction, tool-result-cache）
├── prompt/       # Prompt 组装（PromptBuilder）
├── sse/          # SSE 协议（parser, stream consumer, event dispatcher）
└── utils/        # 工具函数（格式化）
```

## 使用指南

### Runtime — Agent 循环契约

定义 Agent 循环的核心接口，不绑定具体 LLM SDK。

```typescript
import type {
  AgentLoopCallbacks,
  AgentLoopOptions,
  AgentLoopResult,
  PendingToolCall,
  TokenUsage,
} from '@locus-agent/agent-sdk'
```

**`AgentLoopOptions<TModel, TMessage>`** — 启动一次 Agent 循环所需的全部配置：
- `messages` / `systemPrompt` / `model` — 核心三要素
- `callbacks` — 流式回调（`onTextDelta`, `onToolCallStart`, `onReasoningDelta` …）
- `confirmMode` / `getToolApproval` — 工具审批模式
- `toolAllowlist` / `toolTimeoutMs` — 工具沙箱控制

**`AgentLoopResult<TMessage>`** — 循环结束返回值（文本、usage、迭代次数、消息列表）

### Runtime — Tool 执行契约

```typescript
import type {
  StreamingToolExecutor,
  ToolExecutionContext,
  ToolExecutor,
  ToolOutputCallbacks,
} from '@locus-agent/agent-sdk'
```

- `ToolExecutor<TArgs, TResult>` — 简单工具执行器
- `StreamingToolExecutor<TArgs, TResult>` — 支持 stdout/stderr 流式输出的执行器
- `ToolExecutionContext` — 执行上下文（conversationId, workspaceRoot, …）

### Runtime — Tool Policy

```typescript
import type { ToolCategory, ToolPolicyConfig } from '@locus-agent/agent-sdk'
import { classifyTool } from '@locus-agent/agent-sdk'

const category = classifyTool('bash', myPolicy) // => 'serial'
```

将工具分类为 `interactive` | `trusted` | `serial` | `normal`，为未来 Guard Hook 提供判断基础。

### Runtime — Delegation

```typescript
import type {
  DelegateArgs,
  DelegateCallbacks,
  DelegateResult,
  SubAgentConfig,
} from '@locus-agent/agent-sdk'
```

定义子代理（sub-agent）的标准化接口。

### Hooks — 事件模型

SDK 定义了完整的 Agent 生命周期 Hook 事件。

```typescript
import type { HookCategory, HookEventName } from '@locus-agent/agent-sdk'
import { HOOK_CATEGORIES } from '@locus-agent/agent-sdk'

// 16 个生命周期事件，分属 observe / enrich / guard 三类
HOOK_CATEGORIES['tool:before_execute'] // => 'guard'
HOOK_CATEGORIES['session:start'] // => 'observe'
HOOK_CATEGORIES['context:resolve'] // => 'enrich'
```

**事件域：** `session` · `message` · `context` · `model` · `tool` · `delegate` · `artifact` · `run`

**Hook 类别：**
| 类别 | 能力 |
|------|------|
| `observe` | 只读观察，不改变流程 |
| `enrich` | 追加上下文、标签、建议、元数据 |
| `guard` | 可阻断、要求确认、降级或替换策略 |

### Hooks — HookBus

```typescript
import type { HookBus, HookDecision, HookHandler } from '@locus-agent/agent-sdk'

// SDK 只定义接口，实现在 server 端
const bus: HookBus = createMyHookBus()

const unsub = bus.on('tool:before_execute', async (invocation) => {
  if (invocation.payload.toolName === 'bash') {
    return { type: 'require_confirmation', reason: 'bash 需要人工确认' }
  }
  return { type: 'noop' }
})
```

**`HookDecision` 类型：**
`noop` | `append_context` | `patch_prompt` | `suggest` | `require_confirmation` | `block` | `emit_artifact`

### Plugins — 插件清单与权限

```typescript
import type { PluginManifest, PluginPermissions, PluginScope } from '@locus-agent/agent-sdk'
import { hasPermission, PLUGIN_SCOPE_ORDER } from '@locus-agent/agent-sdk'
```

**`PluginManifest`** 定义插件所需的全部元数据：
- `id` — 反向域名标识 (e.g. `com.example.git-guardian`)
- `hooks` — 声明订阅的事件和对应 handler
- `permissions` — 声明所需的权限范围
- `entry.runtime` — 运行时入口模块路径

**`PermissionScope`** 精细权限字符串：
`workspace.read` · `workspace.write` · `network.fetch` · `network.domain:*` · `tools.invoke:*` · `session.read` · `prompt.patch` · `model.block` · `ui.render_panel`

**`PluginScope`** 作用域层级：`global` > `workspace` > `project` > `conversation`

### Context — 自动压缩

```typescript
import {
  COMPACTION_SYSTEM_PROMPT,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_RECENT_TURNS_TO_KEEP,
  shouldCompact,
} from '@locus-agent/agent-sdk'

if (shouldCompact(inputTokens, contextWindow)) {
  // 触发压缩流程
}
```

### Context — Tool Result Cache

```typescript
import type { ResultCacheStorage, ToolResultCacheOptions } from '@locus-agent/agent-sdk'
import { compactToolResults } from '@locus-agent/agent-sdk'

const entries = compactToolResults(messages, {
  storage, // ResultCacheStorage 实现
  hotTailCount: 5, // 保留最近 5 条不压缩
  minSizeToCache: 500,
})
```

### Prompt — PromptBuilder

```typescript
import { createPromptBuilder } from '@locus-agent/agent-sdk'

const builder = createPromptBuilder()
  .addSection({ id: 'role', content: 'You are a coding assistant.', priority: 0 })
  .addSection({ id: 'rules', content: 'Follow best practices.', priority: 10 })

// 插件可通过 patchSection 修改
builder.patchSection('rules', { sectionId: 'rules', action: 'append', content: '\nAlways use TypeScript.' })

const systemPrompt = builder.build()
```

### SSE — 服务端序列化

```typescript
import { createSSEEventPayload, serializeSSEEvent } from '@locus-agent/agent-sdk'

// 服务端发送 SSE 事件
const payload = createSSEEventPayload('text-delta', { textDelta: 'Hello' })
const sseString = serializeSSEEvent(payload) // => "data: {\"type\":\"text-delta\",\"textDelta\":\"Hello\"}\n\n"
```

### SSE — 客户端消费

```typescript
import type { SSEEventHandlers } from '@locus-agent/agent-sdk'
import { consumeSSEStream } from '@locus-agent/agent-sdk'

const handlers: SSEEventHandlers = {
  onTextDelta: delta => appendToUI(delta),
  onToolCallStart: tc => showToolIndicator(tc),
  onDone: (id, usage) => finalize(id, usage),
  onError: (code, msg) => showError(msg),
}

const reader = response.body.getReader()
await consumeSSEStream(reader, handlers)
```

## 设计原则

1. **契约优先** — SDK 只定义接口和纯逻辑，不引入外部重依赖（如 Vercel AI SDK、数据库驱动）
2. **泛型解耦** — `AgentLoopOptions<TModel, TMessage>` 等核心类型使用泛型，不绑定具体实现
3. **单一数据源** — 所有共享类型从 SDK 导出，消费方直接 `import from '@locus-agent/agent-sdk'`，禁止中转 re-export
4. **渐进式采用** — 现有 server/web 可逐步迁移到 SDK 契约，无需一次性重写
