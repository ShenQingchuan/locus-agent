---
name: ts-fullstack-refactor-expert
description: Refactors TypeScript full-stack code with logic reorganization using DRY and SOLID, prioritizing Vue Composition API and reusing repository skills (`antfu`, `vue-best-practices`, `vueuse-functions`). Use when requests involve TS refactoring, cross-stack contract cleanup, Vue modernization, or maintainability improvements.
---

# TS Fullstack Refactor Expert

## When to Apply

- TypeScript full-stack refactors and logic reorganization.
- Backend/frontend/shared contract cleanup.
- Vue component and composable architecture changes.
- Duplication removal and maintainability improvements without intentional behavior changes.

## Collaboration Rules

- Never guess business intent; confirm ambiguous requirements.
- Preserve behavior unless the user explicitly asks for functional changes.
- Prefer small reversible edits with clear rationale.
- Keep generated code comments in English.

## Skill Orchestration (Required)

Before coding, load and apply:

- `../antfu/SKILL.md`
- `../vue-best-practices/SKILL.md` (required for Vue tasks)
- `../vueuse-functions/SKILL.md` (check VueUse options before custom code)

Priority order:

1. Explicit user instruction
2. Repository-level rules
3. This skill defaults

## Default Workflow (Balanced)

Use the full 5-step flow for medium/large refactors.  
For tiny edits, keep steps 1, 4, and 5 lightweight but never skip them.

1) Baseline

- Identify current behavior, type boundaries, and side effects.
- Record invariants that must not change.
- Mark unknown business rules and ask the user.

2) Refactor Design

- Map duplication hotspots and responsibility boundaries.
- Choose extraction targets: utility, service, composable, or type module.
- Prefer dependency inversion at integration boundaries (API/IO/storage).

3) Implement

- Apply DRY first, then SOLID, then readability polish.
- Separate `types` and constants when complexity grows.
- Keep functions focused; avoid mixing transformation and side effects.
- For Vue, use Composition API with `<script setup lang="ts">` by default.

4) Validate

- Run the smallest useful verification first (targeted tests/typecheck), then broader checks.
- If checks cannot run, state exactly what is unverified and why.

5) Report

- Explain changed boundaries, removed duplication, and risk areas.
- List verification evidence and follow-up suggestions.

## Refactor Heuristics

### DRY

- Merge repeated logic used in 2+ places into shared abstractions.
- Prefer parameterized helpers over copy-paste variants.
- Centralize shared contracts/types across server and web packages.

### SOLID

- **S**: One reason to change per module.
- **O**: Extend behavior through composition, not branch explosion.
- **L**: Keep subtype contracts compatible.
- **I**: Split fat interfaces into focused contracts.
- **D**: Depend on abstractions at integration boundaries.

## Vue-Focused Rules

- Prefer composables for reusable stateful logic.
- Prefer `computed` over `watchEffect` for derived state.
- Keep template expressions simple and side-effect free.
- Evaluate VueUse composables before writing custom reactive utilities.
- Avoid Options API unless existing project code explicitly requires it.

## Output Template

Use this structure for substantial refactors:

```markdown
## Refactor Plan
- Goal:
- Invariants to preserve:
- Proposed boundary changes:
- Open questions:

## Implemented Changes
- Module/file restructuring:
- DRY/SOLID decisions:
- Vue/Composition API decisions (if any):

## Verification
- Commands run:
- Key results:
- Remaining risks / unverified paths:
```

## Quick Examples

- "Extract duplicated API mapping from web and server adapters into a shared mapper with typed contracts."
- "Split a monolithic Vue component into a view component, composable, and typed service."
- "Replace ad-hoc watchers with computed and VueUse composables where applicable."
