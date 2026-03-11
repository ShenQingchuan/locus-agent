---
name: locus-agent-sdk
description: "@univedge/locus-agent-sdk shared contracts for agent runtime, hooks, plugins, SSE, and context management. Use when importing SDK types, extending hooks/plugins, or working with agent loop, tool execution, SSE streaming, or prompt building."
metadata:
  author: Locus Agent Team
  version: "2026.3.9"
  source: Extracted from locus-agent monorepo
---

# @univedge/locus-agent-sdk

The shared SDK package for Locus Agent providing runtime contracts, hook event model, plugin system, SSE protocol, context management, and prompt building utilities.

## Preferences

- Always import types directly from `@univedge/locus-agent-sdk` — never re-export from intermediate modules
- SDK defines only interfaces and pure logic; no heavy dependencies (AI SDK, database drivers, etc.)
- Use generic type parameters (`TModel`, `TMessage`) to stay framework-agnostic
- Hook handlers must return a `HookDecision` — use `{ type: 'noop' }` when no action needed

## Module Map

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `runtime/` | Agent loop, tool execution, delegation, policy | `AgentLoopOptions`, `AgentLoopCallbacks`, `ToolExecutor`, `StreamingToolExecutor`, `DelegateArgs`, `classifyTool` |
| `hooks/` | Lifecycle events & hook bus | `HookEventName`, `HookCategory`, `HOOK_CATEGORIES`, `HookBus`, `HookHandler`, `HookDecision`, payload types |
| `plugins/` | Plugin manifest, permissions, scope | `PluginManifest`, `PluginPermissions`, `PermissionScope`, `PluginScope`, `hasPermission` |
| `context/` | Auto-compaction & tool result caching | `shouldCompact`, `compactToolResults`, `CompactionStrategy`, `ResultCacheStorage` |
| `prompt/` | System prompt assembly | `PromptBuilder`, `PromptSection`, `createPromptBuilder` |
| `sse/` | SSE parsing, dispatching, streaming | `parseSSELine`, `serializeSSEEvent`, `consumeSSEStream`, `SSEEventHandlers`, `dispatchSSEEvent` |
| `types/` | Shared base types | `SSEEvent`, `ToolCall`, `ToolResult`, `CoreMessage`, `RiskLevel`, `DelegateDelta` |

## Runtime Contracts

### Agent Loop

```typescript
import type { AgentLoopCallbacks, AgentLoopOptions, AgentLoopResult, PendingToolCall, TokenUsage } from '@univedge/locus-agent-sdk'
```

- `AgentLoopOptions<TModel, TMessage>` — full config for an agent run (model, messages, callbacks, approval mode, tool allowlist)
- `AgentLoopCallbacks` — streaming callbacks: `onTextDelta`, `onToolCallStart`, `onToolCallResult`, `onReasoningDelta`, `onToolPendingApproval`, `onToolOutputDelta`, `onDelegateDelta`, `onFinish`
- `AgentLoopResult<TMessage>` — run result: text, finishReason, usage, iterations, messages

### Tool Execution

```typescript
import type { StreamingToolExecutor, ToolExecutionContext, ToolExecutor, ToolOutputCallbacks } from '@univedge/locus-agent-sdk'
```

- `ToolExecutor<TArgs, TResult>` — simple async executor
- `StreamingToolExecutor<TArgs, TResult>` — with `ToolOutputCallbacks` for stdout/stderr streaming
- `ToolExecutionContext` — conversationId, projectKey, workspaceRoot

### Tool Policy

```typescript
import type { ToolCategory, ToolPolicyConfig } from '@univedge/locus-agent-sdk'
import { classifyTool } from '@univedge/locus-agent-sdk'

const cat = classifyTool('bash', policy) // 'interactive' | 'trusted' | 'serial' | 'normal'
```

### Delegation

```typescript
import type { DelegateArgs, DelegateCallbacks, DelegateResult, SubAgentConfig } from '@univedge/locus-agent-sdk'
```

## Hook Event Model

### 16 Lifecycle Events

| Domain | Events | Category |
|--------|--------|----------|
| session | `session:start`, `session:end` | observe |
| message | `message:user_received` | observe |
| context | `context:resolve` | enrich |
| prompt | `prompt:assemble` | enrich |
| model | `model:before_call` (guard), `model:after_call` (enrich) | mixed |
| tool | `tool:before_execute` (guard), `tool:approval_required` (observe), `tool:after_execute` (enrich) | mixed |
| delegate | `delegate:before_run` (guard), `delegate:after_run` (enrich) | mixed |
| artifact | `artifact:plan_written`, `artifact:file_change_detected` | observe |
| run | `run:finish`, `run:error` | observe |

### HookBus Interface

```typescript
import type { HookBus, HookDecision, HookHandler } from '@univedge/locus-agent-sdk'

bus.on('tool:before_execute', async (invocation) => {
  // invocation.payload is typed per event
  return { type: 'noop' }
})
```

### HookDecision Types

- `{ type: 'noop' }` — no action
- `{ type: 'append_context', items: ContextItem[] }` — inject extra context
- `{ type: 'patch_prompt', patches: PromptPatch[] }` — modify system prompt sections
- `{ type: 'suggest', suggestions: SuggestionItem[] }` — provide suggestions
- `{ type: 'require_confirmation', reason: string }` — pause for user approval
- `{ type: 'block', reason: string, code?: string }` — block the operation
- `{ type: 'emit_artifact', artifact: PluginArtifact }` — output a plugin artifact

## Plugin System

### Manifest

```typescript
import type { PluginManifest } from '@univedge/locus-agent-sdk'

const manifest: PluginManifest = {
  id: 'com.example.git-guardian',
  name: 'Git Guardian',
  version: '1.0.0',
  apiVersion: '1',
  entry: { runtime: './index.js' },
  hooks: [
    { event: 'tool:before_execute', handler: 'onToolBeforeExecute' },
  ],
  permissions: { workspace: ['read'], tools: ['bash'] },
}
```

### Permissions & Scope

```typescript
import type { PermissionScope, PluginScope } from '@univedge/locus-agent-sdk'
import { hasPermission, PLUGIN_SCOPE_ORDER } from '@univedge/locus-agent-sdk'

// Scopes: 'global' > 'workspace' > 'project' > 'conversation'
// Permission strings: 'workspace.read', 'tools.invoke:bash', 'network.domain:api.example.com', etc.
```

## Context Management

### Auto-Compaction

```typescript
import { COMPACTION_SYSTEM_PROMPT, DEFAULT_COMPACTION_THRESHOLD, shouldCompact } from '@univedge/locus-agent-sdk'

if (shouldCompact(inputTokens, contextWindow)) {
  // trigger compaction via MessageSummarizer
}
```

### Tool Result Cache

```typescript
import type { ResultCacheStorage, ToolResultCacheOptions } from '@univedge/locus-agent-sdk'
import { compactToolResults } from '@univedge/locus-agent-sdk'

// Implement ResultCacheStorage for your backend (fs, sqlite, etc.)
const entries = compactToolResults(messages, { storage, hotTailCount: 5, minSizeToCache: 500 })
```

## Prompt Builder

```typescript
import { createPromptBuilder } from '@univedge/locus-agent-sdk'

const prompt = createPromptBuilder()
  .addSection({ id: 'role', content: 'You are a coding assistant.', priority: 0 })
  .addSection({ id: 'rules', content: 'Follow best practices.', priority: 10 })
  .build()
```

Plugins can patch sections via `patchSection(id, { sectionId, action: 'append' | 'prepend' | 'replace' | 'remove', content })`.

## SSE Protocol

### Server Side

```typescript
import { createSSEEventPayload, serializeSSEEvent } from '@univedge/locus-agent-sdk'

const line = serializeSSEEvent(createSSEEventPayload('text-delta', { textDelta: 'Hello' }))
// => "data: {\"type\":\"text-delta\",\"textDelta\":\"Hello\"}\n\n"
```

### Client Side

```typescript
import type { SSEEventHandlers } from '@univedge/locus-agent-sdk'
import { consumeSSEStream } from '@univedge/locus-agent-sdk'

await consumeSSEStream(response.body.getReader(), {
  onTextDelta: d => append(d),
  onDone: (id, usage) => finish(id),
})
```

## Anti-Patterns to Avoid

1. **No re-export chains** — import directly from `@univedge/locus-agent-sdk`, never from an intermediate barrel that re-exports SDK types
2. **No heavy deps in SDK** — SDK must not import `ai` (Vercel AI SDK), `drizzle-orm`, or any runtime-specific library
3. **No concrete implementations for IO** — use interfaces like `ResultCacheStorage`, `MessageSummarizer`; let consumers inject implementations
