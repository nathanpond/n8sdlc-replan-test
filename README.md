# noteapi

A minimal local HTTP notes service in TypeScript, built on `node:http` with no framework. Notes are persisted to a single JSON file (path from `NOTEAPI_FILE`, default `./data/notes.json`), accessed only through `src/storage.ts`.

Local, single-user, no auth. Just initialized — endpoints land milestone by milestone.

## Build and test

```bash
npm install
npm run build      # tsc
npm test           # vitest
npm run lint       # eslint --max-warnings 0 (warnings are errors)
npm run typecheck  # tsc --noEmit
```
