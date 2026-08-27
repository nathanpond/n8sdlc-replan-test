# noteapi

Minimal local HTTP notes service in TypeScript on `node:http` (no framework). Storage is a single JSON file (`NOTEAPI_FILE`, default `./data/notes.json`).

## Invariants

- ALL storage access goes through the `src/storage.ts` interface — no other module touches the persistence layer directly.
- Lint warnings are errors in CI (`eslint --max-warnings 0`).

## n8SDLC project

This project is managed by the n8SDLC workflow (GitHub Issues = the plan; `/n8-stat` shows where things stand). If a change made in this session deviates from what planned issues assume — different library, provider, architecture, dropped/added scope, or amending a declared invariant below — do two things before finishing:
1. Append an `## Ad-hoc` entry to `.n8/decisions.md` (format documented in that file's header) naming the change, the why, and the milestones/issues likely affected.
2. Tell the user which future milestones may now have stale plans and suggest running `/n8-replan`.
