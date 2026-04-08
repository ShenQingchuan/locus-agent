## [0.4.2] - 2026-04-08

### Features

- *(embedding)* Refactor model download process and introduce Hugging Face integration

## [0.4.1] - 2026-04-08

### Documentation

- *(cli)* Remove Bun environment requirement from README.md

## [0.4.0] - 2026-04-08

### Documentation

- *(cli)* Update README.md with enhanced usage instructions and command details


### Features

- *(server)* Implement memory access logging and mining features

- *(memory)* Enhance memory management and taxonomy


### Miscellaneous

- *(server)* Squash drizzle migrations into single baseline


### Refactor

- *(CodingView)* Simplify git loading bar visibility logic

- Migrate runtime from Bun to Node.js

## [0.3.0] - 2026-04-06

### Features

- *(server)* Add review annotations feature

- *(web)* Enhance annotation and diff viewer components

- *(web)* Add inline diff viewer for tool call items

- *(web)* Enhance chat components with inline diff integration and styling improvements

- *(web)* Refactor chat message list with new scrolling and virtualization logic


### Miscellaneous

- *(server)* Update database schema and add patch script

## [0.2.5] - 2026-04-06

### Features

- *(server)* Introduce dedicated memory module

- *(server)* Search conversations by message content

- *(web)* Virtual scroll, focus fix and dependency updates


### Refactor

- *(server)* Migrate routes and tools to memory module

- *(web)* Split large composables and chat store

## [0.2.4] - 2026-04-06

### Bug Fixes

- *(web)* Correct fetchConversation response shape after apiClient refactor

- *(web)* Prevent auto-scroll conflicts during user interaction


### Features

- *(build)* Introduce turborepo and fix build pipeline

- *(server)* Integrate Codex ACP into chat functionality


### Refactor

- *(server)* Split chat route into focused service modules

- *(web)* Unify API layer with apiClient

- *(all)* Replace unsafe  with type narrowing and proper types

- *(server)* Split workspace route and make CORS configurable


### Testing

- Setup vitest and add initial unit tests

## [0.2.3] - 2026-04-05

### Features

- *(web)* Enhance chat interface with input context panel and delegate management


### Miscellaneous

- Update README for npm link

## [0.2.2] - 2026-04-05

### Features

- *(web)* Reduce bundle size and improve build tooling

## [0.2.1] - 2026-04-04

### Bug Fixes

- Type errors in new dep version

- *(chat)* Change dropdown trigger from hover to click for better usability


### Features

- *(server)* Wire missing plugin hook emission points across agent lifecycle


### Miscellaneous

- Update README.md

- Bump all dependencies

- Setup simple-git-hooks

- Remake pnpm lockfile


### Refactor

- *(web)* Extract ChatInput logic into useChatInput composable

- *(web)* Extract CodingView logic into useCodingView composable

- *(web)* Extract MemoriesView logic into useMemoriesView composable

- *(web)* Extract SettingsView logic into useSettingsView composable

- *(web)* Extract SettingsEmbeddingCard into useSettingsEmbeddingCard composable

- *(web)* Extract NoteEditor logic into useNoteEditor composable

- *(web)* Extract ToolCallItem logic into useToolCallItem composable

- *(web)* Split useToolCallItem; move tool display metadata to agent-sdk

- *(web)* Split useAssistantRuntime into assistant-runtime/ directory

- *(web)* Split chat store into sub-modules under stores/chat/

- *(web)* Extract view components from CodingView and MessageBubble

- *(web)* Split large composables into focused sub-modules

- *(web)* Add shared utilities and constants for refactored modules

## [0.2.0] - 2026-04-02

### Bug Fixes

- Prevent memory leak in chat.ts global state maps

- Add transaction wrapping to DB service operations for atomicity

- Improve ACP session continuity, graceful abort, and reasoning display


### Features

- Add Kimi CLI support with shared ACP runner

- *(agent)* Add AI-powered commit message generation


### Miscellaneous

- Migrate to tsdown, upgrade Vite 8, switch to tsgo for type checking


### Refactor

- Split types/provider.ts into llm-provider and coding-executor modules

- Multi-area code quality improvements

- *(web)* Self-contained stream termination in useAssistantStreaming

- *(server)* Extract executeToolWithTimeout helper in tool-call-pipeline

- *(server)* Clear stale connect promise on MCP connection failure

- *(web)* Replace type assertions with type guards in parsers

- *(server)* Add Zod schema validation to API boundary POST endpoints

- *(server)* Parallelize tool result handling in orchestrator

- *(server)* Optimize N+1 query in getConversationWithMessages

- *(web)* Extract whitelist state into useWhitelistStore

- *(server)* Split chat.ts into separate route modules

- Wire ToolCallBashCard, add ESLint boundary rule

- Enhance TypeScript configurations and improve code structure

- Improve type definitions and default settings

- Rewrite CLI with citty for structured subcommands

## [0.1.7] - 2026-04-02

### Bug Fixes

- A2A supports attachments and compact view for toolcalls


### Features

- Introduce Locus UI Style skill and reference materials

- Add A2A local Claude Code integration as coding executor

- Replace A2A with ACP integration and enhance agent-sdk

- *(agent-sdk)* Add ClaudeCodeTool constants and expand risk mapping

- *(agent-sdk)* Add Phase 3 utility modules

- *(agent-sdk)* Add MCP client module (Phase 4)


### Refactor

- *(agent-sdk)* Fix some eslint issue.

## [0.1.6] - 2026-03-14

### Features

- Add memory tagger system prompt and integrate into agent tools

- Enhance tool management and UI for delegate tools

## [0.1.5] - 2026-03-14

### Features

- Add Git status loading indicator and refresh logic in CodingView

- Refactor routing and component structure for improved navigation

- Enhance agent loop and memory management with new memory tags prompt

- Enhance mention search functionality and UI components

## [0.1.4] - 2026-03-14

### Features

- Enhance local embedding model management and API

- Enhance agent loop and tool management for coding context

- Allow server startup without LLM credentials and enhance embedding status handling

- Enhance MonacoEditor loading state and styling

- Improve YOLO mode toggling and conversation state synchronization

- Add mention search functionality and enhance prompt editor

- Enhance memory management tool with listing and batch update capabilities

## [0.1.3] - 2026-03-11


### Features

- Update input schema for manageMemoryTool and MCPManager


### Miscellaneous

- Simplify release script usage and update versioning options


### Refactor

- Update system prompt guidelines for tool usage and memory management

## [0.1.2] - 2026-03-11


### Bug Fixes

- Display dynamic version in CLI output


## [0.1.1] - 2026-03-11


### Bug Fixes

- Adjust padding in MemoriesTagSidebar component for improved layout


### Features

- Implement workspace management and memory scoping

- Add message deletion functionality with confirmation modal

- Enhance changelog generation in release script


### Miscellaneous

- Update release process and script enhancements

- Enhance release process and npm publishing

## [0.1.0] - 2026-03-11

First release here. Hello world!
