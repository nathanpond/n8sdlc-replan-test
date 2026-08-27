# Integrations

## External services: none

This service integrates with **no external services**. There are no HTTP clients, no SDKs, no databases beyond the local SQLite file, no auth providers, and no runtime dependencies at all (`package.json` has only devDependencies). It is a local, single-user service: `node:http` in `src/server.ts`, `node:sqlite` in `src/storage.ts`. Do not introduce an external service, network call, or cloud dependency without an explicit product decision — the deployment model in `.n8/config.yml` is "local single-user service, no hosted environments".

## Environment variables

The complete set of `process.env` reads, all in `src/index.ts`:

```ts
const file = process.env.NOTEAPI_FILE ?? "./data/notes.db";
const port = Number(process.env.PORT ?? 3000);
```

| Variable | Default | Meaning |
|---|---|---|
| `NOTEAPI_FILE` | `./data/notes.db` | Path to the SQLite database. `Storage.open` (`src/storage.ts`) creates the parent directory, refuses to overwrite a non-SQLite file at that path, and performs a one-time import from a legacy `<name>.json` sitting beside it when the DB is empty. |
| `PORT` | `3000` | HTTP listen port. |

Add any new env var read in `src/index.ts` and pass the value into constructors — modules under `src/` other than the entrypoint do not read `process.env`. There is no `.env` loader; set variables in the shell (`NOTEAPI_FILE=/tmp/x.db PORT=8080 npm start`).

## CI: GitHub Actions

One workflow: `.github/workflows/ci.yml` (job name `ci`).

- **Trigger**: `pull_request` targeting `main` only. There is no push, tag, release, or deploy workflow — releases are manual tags (per `.n8/config.yml`: `release: none yet — tagging a release is manual`).
- **Steps** (Ubuntu, Node 22 via `actions/setup-node@v4` with `cache: npm`):
  1. `npm ci`
  2. `npx tsc --noEmit`
  3. `npx eslint . --max-warnings 0` (lint warnings are errors — a stated invariant)
  4. `npx vitest run`
- **Permissions**: `contents: read` (least privilege — keep it that way; widen per-job only when a job genuinely needs it).
- **Concurrency**: superseded PR builds cancel via group `ci-pr-${{ github.event.pull_request.number }}`.

Mirror any new required check here AND in `package.json` scripts so local `npm run lint` / `npm test` / `npm run typecheck` match CI exactly.

## GitHub repo integration

- **Remote**: `origin` → `https://github.com/nathanpond/n8sdlc-replan-test.git` (public; also recorded in `.n8/config.yml` as `repo: nathanpond/n8sdlc-replan-test`).
- **Dependabot**: `.github/dependabot.yml` runs weekly update checks for two ecosystems: `npm` (directory `/`) and `github-actions` (directory `/`). Dependency bumps arrive as PRs and must pass the CI gate above.
- **Issue templates**: `.github/ISSUE_TEMPLATE/` provides `bug.yml`, `story.yml`, `epic.yml`, and `config.yml`. File work items using these forms; `.n8/config.yml` sets `security_findings: issues`, so security findings are tracked as GitHub issues too (see `SECURITY.md`).

## Project-process metadata (`.n8/`)

`.n8/config.yml` is machine-read project metadata (stack, repo, CI provider, deployment model, areas: `api`, `storage`, `ci`, `docs`); `.n8/decisions.md` records decisions. Keep `.n8/config.yml` consistent with reality when changing CI or deployment shape.

---
*Generated from commit `1ce69772275aff911e8ed7f0f4800d229b4c5e63` by /n8-map.*
