# Locus UI Style Index

## One-line summary

The product UI is a compact desktop workbench with quiet neutral colors, subtle borders, restrained motion, and strong reuse of simple cards, lists, popovers, and tool-like controls.

Two extra style anchors:

- avoid bordered buttons by default
- keep radius moderate, not oversized

## Read these files first

### Global style source

- `apps/web/src/styles/main.css`
- `apps/web/uno.config.ts`

### Layout and navigation

- `apps/web/src/components/layout/AppNavRail.vue`
- `apps/web/src/components/chat/Sidebar.vue`
- `apps/web/src/views/ChatView.vue`
- `apps/web/src/views/SettingsView.vue`
- `apps/web/src/views/MemoriesView.vue`

### Inputs and content

- `apps/web/src/components/chat/ChatInput.vue`
- `apps/web/src/components/chat/MessageBubble.vue`
- `apps/web/src/components/settings/SettingsLLMCard.vue`
- `apps/web/src/components/knowledge/MemoryNoteCard.vue`

### Shared UI primitives

- `packages/ui/src/components/Modal.vue`
- `packages/ui/src/components/Dropdown.vue`
- `packages/ui/src/components/Select.vue`
- `packages/ui/src/components/CommandPalette.vue`
- `packages/ui/src/components/List.vue`
- `packages/ui/src/components/ListItem.vue`
- `packages/ui/src/components/Tooltip.vue`
- `packages/ui/src/components/ContextMenu.vue`

## Existing semantic classes to reuse

Defined in `apps/web/uno.config.ts`.

### Layout helpers

- `flex-center`
- `flex-col-center`
- `container-chat`

### Buttons

- `btn-primary`
- `btn-secondary`
- `btn-destructive`
- `btn-outline`
- `btn-ghost`
- `btn-link`
- `btn-xs`
- `btn-sm`
- `btn-lg`
- `btn-icon`

### Form fields

- `input-field`
- `select-field`
- `textarea-field`

### Cards and badges

- `card`
- `card-header`
- `card-title`
- `card-description`
- `card-content`
- `card-footer`
- `badge-default`
- `badge-secondary`
- `badge-destructive`
- `badge-outline`

### Overlay and utility styles

- `popover-content`
- `separator-horizontal`
- `separator-vertical`
- `alert`
- `alert-destructive`

## Shared primitives already available

Prefer these before custom building:

- `Modal`
- `Dropdown`
- `Select`
- `Tooltip`
- `ContextMenu`
- `CommandPalette`
- `List`
- `ListItem`
- `VirtualList`
- `Tree`
- `FileTree`
- `DirectoryPicker`
- `DirectoryBrowserModal`
- `ImageAttachmentStrip`
- `Switch`
- `ToastContainer`

## Representative page patterns

### Narrow nav rail plus workspace panel

Use when the feature belongs to the main app shell.

- `AppNavRail.vue`
- `Sidebar.vue`
- `ChatView.vue`
- `SettingsView.vue`
- `MemoriesView.vue`

### Dense settings cards

Use for grouped configuration with small labels and compact controls.

- `SettingsLLMCard.vue`
- `SettingsMCPCard.vue`
- `SettingsEmbeddingCard.vue`
- `SettingsWhitelistCard.vue`

### Card stream and note timeline

Use for scannable content feeds with light grouping and low visual noise.

- `MemoriesView.vue`
- `MemoryNoteCard.vue`
- `MemoriesComposer.vue`

### Overlay menus and command surfaces

Use for compact tool-like overlays instead of full-page takeovers.

- `CommandPalette.vue`
- `Dropdown.vue`
- `Select.vue`
- `Modal.vue`
- `WorkspacePopover.vue`

## Build order for new UI

1. Find the nearest existing screen pattern.
2. Reuse existing shell layout if the new feature lives inside an existing view.
3. Reuse semantic classes from `uno.config.ts`.
4. Reuse `packages/ui` primitives.
5. Only add new utilities or components when the existing system cannot express the requirement cleanly.

## Quick review checklist

- Is the UI still neutral and quiet, or did it become loud and decorative?
- Are borders subtle and shadows restrained?
- Did buttons avoid unnecessary bordered-box treatment?
- Are corners still in the moderate radius range instead of becoming too round?
- Is spacing compact enough to match the rest of the app?
- Does the component use existing `btn-*`, `card`, `input-field`, `badge-*`, and overlay styles where appropriate?
- Does the feature look like a tool panel rather than a marketing section?
- Are hover, selected, loading, disabled, and destructive states present and visually consistent?
- Is there a simpler nearby pattern in the codebase that should have been reused?

## Read next when needed

- For a deeper style read, open `references/ui-style-notes.md`.
