# Concerns

Real, code-verified concerns, ordered by severity (highest first). Context for calibration: noteapi is a local, single-user service — no auth is by design, and network-exposure findings are graded accordingly.

## 1. Unbounded request body buffering

- **Issue:** `readBody` accumulates the entire request body in memory with no size cap, so a single oversized `POST /notes` can exhaust process memory.
- **Files:** `src/server.ts:12-19` (`readBody`), consumed at `src/server.ts:51`.
- **Impact:** Any client that can reach the port (including a careless local script or a piped file) can send a multi-gigabyte body; every chunk is pushed into `chunks` until the process OOMs or stalls. There is also no cap on stored `title`/`body` length, so a huge-but-parseable payload lands in the database verbatim. Severity is moderated by the local single-user deployment, but the failure mode is process death, not a 4xx.
- **Fix approach:** Track accumulated byte length in `readBody`; past a small cap (e.g. 1 MiB), destroy the request and respond `413`. Optionally add max lengths for `title`/`body` in `parseCreate`.

## 2. Legacy JSON migration validates the container but not the notes

- **Issue:** `isLegacyStoreFile` checks only `version === 1` and that `notes` is an object; individual note fields are inserted without validation.
- **Files:** `src/storage.ts:25-33` (shape guard), `src/storage.ts:135-142` (unvalidated insert).
- **Impact:** For a legacy `notes.json` whose note values are missing fields (e.g. `{"version":1,"notes":{"a":{"id":"a"}}}`), `insert.run(note.id, note.title, ...)` binds `undefined` and `node:sqlite` throws `ERR_INVALID_ARG_TYPE` — startup fails with a cryptic bind error instead of the intended "unrecognized shape; refusing to import it" message. Worse, non-string values that SQLite can bind (numbers for `title`/`createdAt`, or `tags: [1,2]`, which passes the `Array.isArray` check at `src/storage.ts:140`) import silently, producing rows that violate the declared `Note` type and can mis-sort `listNotes` (`createdAt` comparison at `src/storage.ts:185`).
- **Fix approach:** Extend the guard (or add a per-note check inside the import loop at `src/storage.ts:135`) requiring `id`/`title`/`body`/`createdAt` to be strings and `tags` an array of strings; reject the file with the existing "unrecognized shape" error otherwise.

## 3. CI never runs on pushes and never runs the shipped build

- **Issue:** The CI workflow triggers only on `pull_request` and runs `tsc --noEmit`, lint, and tests — never `npm run build` (`tsc -p tsconfig.build.json`).
- **Files:** `.github/workflows/ci.yml` (trigger block: `on: pull_request: branches: [main]`; steps run `npx tsc --noEmit`, `npx eslint . --max-warnings 0`, `npx vitest run`), `tsconfig.build.json`, `package.json:7` (`"build": "tsc -p tsconfig.build.json"`).
- **Impact:** Direct pushes to `main` are never checked at all. Even on PRs, a build-only break ships green: `tsconfig.build.json` differs from `tsconfig.json` (adds `rootDir: "src"`, drops `test/` from `include`), and `declaration: true` emit errors do not surface under `--noEmit` — so `npm start` (which runs `dist/index.js`) can be broken while CI passes.
- **Fix approach:** Add `push: branches: [main]` to the trigger and an `npm run build` step (which also replaces the redundant `tsc --noEmit` for `src/`; keep `--noEmit` if `test/` type coverage matters).

## 4. Stale docs: config and README contradict the shipped code

- **Issue:** `.n8/config.yml` says the service "runs locally against a JSON data file", and the README says the project is "Just initialized — endpoints land milestone by milestone" — both false against the code.
- **Files:** `.n8/config.yml:11` (`notes: No deploy jobs; the service runs locally against a JSON data file.`), `README.md:5`; contradicted by `src/storage.ts:6` (`import { DatabaseSync } from "node:sqlite"`) and the full CRUD router in `src/server.ts:46-67`.
- **Impact:** A reader (or a planning/audit agent consuming `.n8/config.yml`) is told JSON-file storage and a not-yet-built API; the README also documents no endpoints at all despite `GET/POST /notes`, `GET/DELETE /notes/:id` being live and tested. Doc drift only — no runtime effect.
- **Fix approach:** Change `.n8/config.yml:11` to "against a local SQLite database (node:sqlite)"; replace the README's "Just initialized" sentence with a short endpoint table.

## 5. Storage API mixes sync and promise-wrapped-sync methods

- **Issue:** `createNote`, `deleteNote`, and `open` return `Promise.resolve(...)` around synchronous work while `getNote` and `listNotes` are plain sync — an inconsistent contract left over from the JSON-file (async) storage engine.
- **Files:** `src/storage.ts:66-74` (`open` with the wrapper rationale comment), `src/storage.ts:151-163` (`createNote` → `Promise.resolve(note)`), `src/storage.ts:173-176` (`deleteNote` → `Promise.resolve(changes > 0)`), vs. sync `getNote` (`src/storage.ts:165-170`) and `listNotes` (`src/storage.ts:183-188`).
- **Impact:** Callers must remember which methods need `await` (`src/server.ts:48` calls `listNotes()` bare; `:53` and `:61` await); a forgotten `await` on the promise-returning ones type-checks in loose positions and returns a pending promise instead of a value. Pure tech debt — current call sites are correct and tests pass.
- **Fix approach:** Make the whole surface sync (node:sqlite is sync; adjust `src/server.ts` and both test files), or make all five methods async for one uniform contract. Either way, do it in one pass so the boundary has a single calling convention.

---
*Generated from commit `1ce69772275aff911e8ed7f0f4800d229b4c5e63` by /n8-map.*
