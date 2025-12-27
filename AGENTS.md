# Repository Guidelines

## Project Structure & Module Organization

- `src/`: TypeScript library source. Public exports live in `src/index.ts`; core event types/logic are in files like `src/sync-event.ts` and `src/types.ts`.
- `src/containers/`: Optional building blocks (e.g. `queue/`, `channel/`, `websocket/`).
- `src/proxy/`: Web/DOM event proxy helpers.
- Tests are colocated with code as `*.test.ts` (for example `src/index.test.ts`).
- `config/`: Build-only TypeScript config (`config/tsconfig.production.json`).
- `docs/`: Architecture and development notes.
- `dist/`: Generated build output (gitignored; don’t commit).

## Build, Test, and Development Commands

CI uses Node.js 18. The repo contains multiple lockfiles; prefer `yarn` for day-to-day work to match CI, and only commit the lockfile for the package manager you used.

- `yarn` — install dependencies.
- `yarn test` — run Jest (clears `dist/` first).
- `yarn test:coverage` — run coverage (used to generate badges in `badges/` via CI).
- `yarn build` — compile TypeScript to `dist/` using `config/tsconfig.production.json` and rewrite path aliases via `tsc-alias`.

## Coding Style & Naming Conventions

- TypeScript is `strict`; prefer type-safe APIs and avoid `any` unless there’s no practical alternative.
- Formatting/linting: Prettier (`.prettierrc.js`) and ESLint (`.eslintrc`) are based on `@swnb/fabric`.
  - Format: `npx prettier -w src`
  - Lint: `npx eslint src --ext .ts`
- Naming: use kebab-case file names (e.g. `sync-event.ts`) and suffix tests with `.test.ts`.
- Imports: prefer the `@/` path alias (maps to `src/`) for internal modules.

## Testing Guidelines

- Framework: Jest + `ts-jest` (see `jest.config.js`).
- Keep tests deterministic (avoid real network/time dependencies); add unit tests alongside the module you changed.

## Commit & Pull Request Guidelines

- Commits follow a Conventional Commits style in history (`feat:`, `fix:`, `refactor:`, `chore:`, `release:`); keep subjects imperative and scoped to one change.
- PRs should explain what/why, include tests for behavior changes, and update `README.md`/`docs/` when the public API changes.
