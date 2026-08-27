# noteapi

A minimal local HTTP notes service in TypeScript, built on `node:http` with no framework. Notes are persisted to a SQLite database via Node's built-in `node:sqlite` (path from `NOTEAPI_FILE`, default `./data/notes.db`), accessed only through `src/storage.ts`. On startup, if a legacy `notes.json` sits next to the database and the database is empty, its notes are imported once; the JSON file is left untouched. Requires Node 22.13+ (unflagged `node:sqlite`).

Local, single-user, no auth. Just initialized — endpoints land milestone by milestone.

## Build and test

```bash
npm install
npm run build      # tsc
npm test           # vitest
npm run lint       # eslint --max-warnings 0 (warnings are errors)
npm run typecheck  # tsc --noEmit
```
