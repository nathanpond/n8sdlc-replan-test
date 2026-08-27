# Stack

## Languages and runtime

- **TypeScript** (strict mode), compiled with `tsc`. All service code is in `src/` as ESM (`"type": "module"` in `package.json`); imports between local modules use `.js` extensions (`import { Storage } from "./storage.js"` in `src/index.ts`).
- **Runtime: Node.js 22+**. CI pins Node 22 (`node-version: 22` in `.github/workflows/ci.yml`). Node 22.13+ is required because the service uses **unflagged `node:sqlite`** (`DatabaseSync` in `src/storage.ts`). There is no `engines` field in `package.json` — treat the CI pin and the `node:sqlite` requirement in `README.md` as authoritative.
- **Zero runtime dependencies.** The HTTP layer is bare `node:http` (`src/server.ts`), persistence is `node:sqlite` (`src/storage.ts`). Do not add a web framework or a DB driver; use the built-in `node:` modules.

## Dependency versions (devDependencies only — exact, from `package-lock.json`)

| Package | Locked version | Range in `package.json` |
|---|---|---|
| `typescript` | 6.0.3 | ^6.0.3 |
| `eslint` | 10.9.1 | ^10.9.1 |
| `@eslint/js` | 10.0.1 | ^10.0.1 |
| `typescript-eslint` | 8.68.0 | ^8.68.0 |
| `vitest` | 4.1.11 | ^4.1.11 |
| `@types/node` | 26.4.0 | ^26.4.0 |

## Build / run / test / lint commands

Use the npm scripts in `package.json` — these are the exact commands CI mirrors:

```bash
npm install            # or npm ci (CI uses npm ci)
npm run build          # tsc -p tsconfig.build.json  → emits dist/
npm test               # vitest run
npm run lint           # eslint . --max-warnings 0   (warnings ARE errors)
npm run typecheck      # tsc --noEmit                (whole project incl. test/)
npm start              # node dist/index.js          (build first)
```

CI (`.github/workflows/ci.yml`) runs, in order: `npm ci` → `npx tsc --noEmit` → `npx eslint . --max-warnings 0` → `npx vitest run`. Any change must pass all three locally before a PR.

Runtime configuration for `npm start`: `NOTEAPI_FILE` (SQLite path, default `./data/notes.db`) and `PORT` (default `3000`) — read in `src/index.ts`.

## TypeScript configuration

Two tsconfigs:

- `tsconfig.json` — the type-check surface: `include: ["src", "test"]`, `target: ES2023`, `module`/`moduleResolution: NodeNext`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `declaration`, `sourceMap`, `types: ["node"]`. `npm run typecheck` uses this.
- `tsconfig.build.json` — extends it with `rootDir: "src"`, `include: ["src"]` so `dist/` contains only service code. `npm run build` uses this.

Write code that satisfies `noUncheckedIndexedAccess` — index accesses are `T | undefined`; the codebase handles this with explicit fallbacks, e.g. `decodeURIComponent(segments[1] ?? "")` in `src/server.ts`.

## Lint configuration (flat config)

`eslint.config.mjs` composes `js.configs.recommended` + `tseslint.configs.recommendedTypeChecked` with `projectService: true` (type-aware linting). Invariants:

- **Warnings are errors**: always lint with `--max-warnings 0`. No rules are tuned down; any future suppression must carry a one-line rationale (stated in the config header comment).
- **Storage-boundary invariant**: `no-restricted-imports` forbids `node:fs`, `node:fs/promises`, `fs`, `fs/promises`, and `node:sqlite` everywhere except `src/storage.ts` (the persistence boundary) and `test/**`. All persistence goes through `src/storage.ts` — route handlers in `src/server.ts` only call `Storage` methods. This rule is itself guarded by a test: `test/lint-guard.test.ts` lints fixtures in-memory and asserts the rule fires outside `src/storage.ts`. If you touch the lint config, keep that test green.

Ignored by lint: `dist/`, `node_modules/`, `data/`.

## Tests

- Framework: **Vitest 4** (`vitest run`, no watch in CI). Tests live in `test/`: `test/server.test.ts`, `test/storage.test.ts`, `test/lint-guard.test.ts`.
- Tests may import `node:fs`/`node:sqlite` directly (exempt from the storage-boundary rule) to inspect data files and prove storage behavior.
- `test/` is type-checked by `npm run typecheck` (it is in `tsconfig.json`'s `include`) but excluded from the build.

## Layout

- `src/index.ts` — entrypoint: reads env, `await Storage.open(file)`, `makeServer(storage).listen(port)`.
- `src/server.ts` — `node:http` server + hand-rolled router (`/notes` GET/POST, `/notes/:id` GET/DELETE). Handlers validate JSON bodies inline (`parseCreate`) and reply via a `sendJson(res, status, payload)` helper; a top-level `.catch` converts handler bugs into a 500 without crashing the process.
- `src/storage.ts` — `Storage` class over `node:sqlite` `DatabaseSync`; sole owner of filesystem/DB access. Includes one-time import from a legacy `<name>.json` beside the DB when the DB is empty.
- `dist/` — build output (committed in tree; regenerate with `npm run build`, never edit).
- `data/` — runtime SQLite database location (git-ignored, lint-ignored).

---
*Generated from commit `1ce69772275aff911e8ed7f0f4800d229b4c5e63` by /n8-map.*
