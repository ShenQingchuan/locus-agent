# Conventions

## Use catalogs
- Manage every external NPM dependencies with catalogs
- Use specified catalog category name in `pnpm-workspace.yaml` instead of directly putting into `catalog:`

## Pay attention to type errors & lints
- Run `pnpm typecheck` and `pnpm lint --fix` after each task to ensure code quality
