# Locus UI Style Notes

## Positioning

This product behaves like a desktop workspace for ongoing tasks. The UI is not trying to sell, impress, or dramatize. It is trying to stay out of the way while keeping complex state legible.

That leads to a style with these recurring qualities:

- low-saturation neutral palette
- borders more important than shadows
- compact controls and moderate information density
- restrained motion
- clear active and selected states
- overlays that feel like tools, not spotlight moments

## Visual tone

The core evidence is in `apps/web/src/styles/main.css` and `apps/web/uno.config.ts`.

### Colors

- The system is built on `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, and sidebar variables.
- The palette is mostly grayscale with a few functional accents.
- Color is used sparingly for state, not for decoration.
- Blue, green, amber, or red appear mainly as status cues or narrow mode indicators.

### Borders and shadows

- Borders are intentionally subtle.
- Cards usually rely on border contrast first.
- Shadows are light and reserved for overlays or slight hover lift.
- Heavy elevation is unusual and should be treated as suspicious.
- Buttons should not default to visible solid borders. A bordered button is an exception, not the baseline.

### Radius

- Rounded corners are consistent and moderate.
- Most reusable shapes cluster around `rounded-md` and `rounded-lg`.
- The UI avoids either sharp corners everywhere or oversized friendly rounding.
- Avoid large pill-like rounding on buttons, cards, panels, and dialogs unless a nearby existing pattern already does that.

## Typography

There is one important implementation detail:

- `apps/web/uno.config.ts` configures `sans` as `Archivo` and `mono` as `Fira Code`.
- `apps/web/src/styles/main.css` sets the `body` font stack to an `Inter`-style system stack.

That means typography is intentionally practical rather than precious. In practice:

- default UI text should follow the existing page behavior instead of forcing a new font utility everywhere
- monospaced text is used selectively for versions, tags, model names, and technical identifiers
- font size often stays in the `text-xs` to `text-sm` range for supporting UI

Do not introduce a new typeface or start styling pages around oversized display text.

## Layout habits

### Product shell

The app often uses:

- a very narrow nav rail
- a secondary working panel or sidebar
- a main content area with low visual separation

Examples:

- `AppNavRail.vue`
- `Sidebar.vue`
- `ChatView.vue`
- `SettingsView.vue`
- `MemoriesView.vue`

This creates a strong desktop-tool feel. When adding a new feature inside the app shell:

- preserve the left-to-right working structure
- prefer embedded panels over isolated full-page reinvention
- use borders to separate regions before reaching for background color changes

### Density

The app favors readable density, not maximal airiness.

Common signals:

- icon buttons at `8x8` or `9x9` scale
- compact rows
- `text-xs` helper copy
- cards with modest padding
- thin resize handles and narrow side rails

Do not make a new panel feel mobile-first, oversized, or presentation-like unless there is a strong reason.

## Interaction tone

### Motion

Global transitions are short and mostly color-based.

Observed pattern:

- default durations around `150ms`
- opacity or scale transitions for overlays
- minimal use of animated transforms
- no bouncy motion language

The theme switch ripple is a special case, not a general motion pattern.

### Hover and active states

Interactive feedback is usually expressed through:

- subtle background tint
- slightly stronger foreground color
- gentle border change
- rare small shadow lift

Examples:

- nav rail buttons in `AppNavRail.vue`
- conversation rows in `ConversationItem.vue`
- memory cards in `MemoryNoteCard.vue`
- dropdown and select menus in `Dropdown.vue` and `Select.vue`

Avoid oversized hover animations, sliding gimmicks, or exaggerated press states.

### Focus treatment

`main.css` globally removes native focus outlines and box shadows.

That is a project decision. Do not "fix" it by spraying bright custom rings across one feature. Instead:

- make focusable structure obvious through spacing and grouping
- keep selected and active states consistent
- if you must add focus feedback, make it compatible with the quiet visual system

## Component patterns

### Buttons

Button semantics are centralized in `uno.config.ts`.

Preferred usage:

- `btn-primary` for the main action in a compact area
- `btn-outline` for secondary actions that need more framing
- `btn-ghost` for toolbar, icon, and low-emphasis actions
- `btn-icon` for square icon buttons
- `btn-sm` and `btn-xs` for dense interfaces

Additional preference:

- do not reach for `btn-outline`
- if a bordered button seems necessary, ask the user first instead of deciding unilaterally
- if a button works as `btn-primary`, `btn-secondary`, or `btn-ghost`, prefer those first

If a button looks wrong, first check whether the wrong variant was chosen before inventing a new style.

### Cards

Cards are common, but they are plain:

- quiet background
- subtle border
- occasional `shadow-sm`
- modest radius

Examples:

- `SettingsLLMCard.vue`
- `MemoryNoteCard.vue`
- `MemoriesComposer.vue`

Cards should feel like containers for tools or data, not glossy tiles.

### Inputs and forms

Forms tend to use:

- small labels
- restrained helper text
- standard `input-field` and `select-field`
- simple vertical rhythm

Examples:

- `SettingsLLMCard.vue`
- settings sub-cards

Do not over-style forms. Clarity and density matter more than flourish.

### Menus, popovers, dialogs

Overlays are compact and practical.

Shared traits:

- rounded corners
- visible but not loud border
- medium shadow
- short fade or scale-in
- compact row height

Examples:

- `CommandPalette.vue`
- `Dropdown.vue`
- `Select.vue`
- `Modal.vue`
- `WorkspacePopover.vue`

If a dialog starts to feel theatrical or full-bleed, it is probably drifting from the house style.

### Lists and rows

Rows usually rely on:

- left-aligned text
- light hover background
- clear active state
- optional trailing actions that appear on hover

Examples:

- `ConversationItem.vue`
- `ListItem.vue`

This pattern supports dense scanning. Keep secondary metadata small and subdued.

## Content-specific patterns

### Chat surfaces

The chat area is the center of the product and shows a few key preferences:

- structure and tooling are more important than decoration
- headers and toolbars stay compact
- the composer packs multiple controls into one tight zone
- cards inside the message stream are styled to stay visually related to the shell

Relevant files:

- `ChatView.vue`
- `ChatInput.vue`
- `MessageBubble.vue`
- `ToolCallItem.vue`

### Settings surfaces

Settings are organized into cards and sectioned panels, not giant forms.

The feel is:

- dense
- segmented
- low-drama
- technical but readable

Relevant files:

- `SettingsView.vue`
- `SettingsLLMCard.vue`
- sibling settings cards

### Memory surfaces

Memory pages show how the product handles content browsing without becoming visually noisy.

Relevant cues:

- timeline grouping
- small metadata
- lightweight tags
- bordered cards with mild hover lift

Relevant files:

- `MemoriesView.vue`
- `MemoryNoteCard.vue`
- `MemoriesComposer.vue`

## Copy and labeling

The product copy is straightforward and tool-oriented.

Patterns:

- labels are short
- helper text is brief
- destructive text is explicit
- status labels are factual

Do not write splashy product-marketing copy into controls, headers, or empty states unless the surrounding feature already does that.

## Anti-patterns

These will usually feel wrong in this project:

- hero sections, oversized headlines, center-staged empty space
- strong gradient backgrounds
- glassmorphism, blur-heavy panels, neon accents
- thick borders everywhere
- border-heavy buttons used as the default action style
- deep shadows on ordinary cards
- playful motion and bounce
- oversized pill radius on ordinary controls and containers
- large pill buttons as the default control language
- introducing a new custom primitive where `packages/ui` already has one
- ignoring `btn-*`, `card`, `input-field`, and related semantic shortcuts

## Allowed exceptions

Breaking pattern can be correct when:

- the feature introduces a genuinely new interaction model not covered by current primitives
- a special status needs stronger visual emphasis
- a dedicated code or visualization surface needs its own presentation rules

Even then:

- reuse the same tokens and palette first
- keep radius, density, and motion close to the rest of the app
- isolate the exception instead of letting it redefine the surrounding page

## How to use these notes

Use this file to judge fit, not to freeze the UI.

When code and notes disagree:

1. trust the current nearby implementation first
2. use this file to understand the direction behind it
3. update the notes later if the codebase has clearly moved
