---
name: locus-ui-style
description: Use for UI work in this repository when building, refining, or reviewing screens in apps/web. Keeps new interfaces aligned with the current Locus product style, reuses existing semantic classes and packages/ui primitives, and reviews UI by checking fit with the project's established patterns rather than generic design trends.
---

# Locus UI Style

This skill is for project-local UI work. It exists to keep future interface changes visually and behaviorally consistent with the current `apps/web` product.

Read this skill when:

- building a new screen, panel, card, form, dialog, popover, list, or toolbar in `apps/web`
- polishing or refactoring existing UI
- reviewing whether a UI change fits the current product style
- deciding whether to reuse an existing pattern or introduce a new one

## First read

Start with `references/ui-style-index.md`.

Only read `references/ui-style-notes.md` when:

- the target area has multiple competing patterns
- you need deeper guidance on density, interaction tone, or component composition
- you are reviewing a page and need richer examples of what "fits" or "doesn't fit"

## Core rules

1. Treat the existing project UI as the source of truth. Match it before improving it.
2. Reuse semantic shortcuts from `apps/web/uno.config.ts` before inventing new utility combinations.
3. Reuse `packages/ui` primitives before writing custom controls.
4. Prefer nearby patterns from the same area of the product over distant but more generic patterns.
5. Keep the interface quiet, compact, and tool-like. This product is a desktop workbench, not a marketing page.
6. Prefer subtle borders, muted fills, and restrained hover states over heavy shadows, saturated fills, or decorative motion.
7. Keep animation short and practical. Existing UI mostly stays in the 100ms to 200ms range and avoids bounce.
8. Preserve information density. Do not add oversized spacing, giant typography, or oversized controls unless the surrounding area already works that way.
9. Respect the project's current accessibility tradeoffs. The app globally removes native focus rings, so interactive affordance must still be visible through layout, hover, active, selected, and disabled states.
10. When in doubt, copy the structure of an existing page pattern and adapt the content, not the other way around.
11. Avoid giving buttons explicit bordered-box styling unless that variant already exists and is clearly the right semantic choice.
12. Keep corner radius moderate. Do not drift toward oversized rounded pills or overly soft card/dialog shapes.

## Implementation workflow

1. Read `references/ui-style-index.md`.
2. Inspect the target file and the closest matching example files listed in the index.
3. Reuse existing shortcuts such as `btn-*`, `card`, `input-field`, `select-field`, `badge-*`, `popover-content`, `flex-center`.
4. Prefer existing primitives from `packages/ui` such as `Modal`, `Dropdown`, `Select`, `Tooltip`, `CommandPalette`, `List`, `ListItem`, `ContextMenu`.
5. If you still need a new visual pattern, keep it compatible with the current palette, radius, density, and motion rules.
6. After editing, self-check against the review checklist in `references/ui-style-index.md`.

## Review workflow

When asked to review UI, focus on these questions:

- Does it look like it belongs to this product?
- Does it reuse existing semantic classes and primitives where possible?
- Does it preserve the current density and hierarchy?
- Are hover, selected, loading, destructive, and disabled states handled in the same visual language as the rest of the app?
- Did the author introduce a new visual dialect without a real need?

Report drift in project terms. Good examples:

- "This panel uses heavier shadows than the rest of the app."
- "This action button should probably reuse `btn-outline` or `btn-ghost`."
- "This dialog looks more like a marketing modal than the project's existing workspace overlays."

Avoid vague style feedback with no project anchor.

## Hard constraints

- Do not introduce a new color system when the existing CSS variables already cover the need.
- Do not add decorative gradients, glassmorphism, loud elevation, or playful motion unless the surrounding feature already uses them.
- Do not replace quiet borders with strong outlines everywhere.
- Do not default to bordered buttons. Prefer fill, ghost, or subtle background emphasis first. If a bordered button seems necessary, stop and ask the user before using `btn-outline` or introducing any similar treatment.
- Do not enlarge radius casually. Treat the current `rounded-md` to `rounded-lg` range as the default safe zone.
- Do not create a custom button, dropdown, modal, or select if `packages/ui` already has a suitable primitive.
- Do not use generic "best practice" review comments that ignore this codebase's current style and constraints.

## Source of truth

The references are a guide, not a frozen mirror of the codebase. If the target area has changed, inspect the current implementation before deciding.
