# noteapi

Minimal local HTTP notes service in TypeScript on `node:http` (no framework). Storage is a SQLite database via `node:sqlite` (`NOTEAPI_FILE`, default `./data/notes.db`); a legacy `notes.json` beside the DB is imported once on startup when the DB is empty, and is never modified.

## Invariants

- **test-enforced** — ALL storage access goes through the `src/storage.ts` interface; no other module touches the persistence layer (filesystem/data file) directly. Guard: lint rule restricting `node:fs` and `node:sqlite` imports to `src/storage.ts` (guard: #9 — test-enforced becomes true when the guard code merges).
- **test-enforced** — Lint warnings are errors in CI (`eslint --max-warnings 0` in the CI workflow). (guard: #7)

Amending an invariant is a user decision and plan drift by definition: log it as an `## Ad-hoc` entry in `.n8/decisions.md` and run `/n8-replan`.

## n8SDLC project

This project is managed by the n8SDLC workflow (GitHub Issues = the plan; `/n8-stat` shows where things stand). If a change made in this session deviates from what planned issues assume — different library, provider, architecture, dropped/added scope, or amending a declared invariant below — do two things before finishing:
1. Append an `## Ad-hoc` entry to `.n8/decisions.md` (format documented in that file's header) naming the change, the why, and the milestones/issues likely affected.
2. Tell the user which future milestones may now have stale plans and suggest running `/n8-replan`.
