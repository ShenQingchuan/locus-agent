# Conventions

## Avoid reverting user changes

- Alwasy read file current state first, because user may introduce some new changes during cooperation with AI.

## Use catalogs
- Manage every external NPM dependencies with catalogs
- Use specified catalog category name in `pnpm-workspace.yaml` instead of directly putting into `catalog:`

## Pay attention to type errors & lints
- Run `pnpm typecheck` and `pnpm lint --fix` after each task to ensure code quality
