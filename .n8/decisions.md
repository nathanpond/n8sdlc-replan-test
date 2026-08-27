# Decision log (append-only)

One `##` section per skill run; ad-hoc (outside-the-workflow) changes get an `## Ad-hoc — <date>` section. Ad-hoc entry format:

```markdown
## Ad-hoc — YYYY-MM-DD

- **Change:** <what changed, e.g. auth provider switched from Google to Okta>
  **Why:** <reason>
  **Affects:** <milestones/issues whose plans may now be stale>
```

`/n8-replan` appends `— reconciled by /n8-replan <date>` to entries it has processed.

## /n8-init — 2026-08-27

- **Decision:** Overwrote descriptions of stock GitHub default labels (`documentation`) with the n8SDLC baseline without per-label confirmation.
  **Why:** Labels were the untouched GitHub defaults, not a curated taxonomy; no issue history exists. No labels were deleted.
- **Decision:** `area:*` set is `api, storage, ci, docs`; `area:storage` maps to `src/storage.ts` rather than a directory.
  **Why:** The storage module is the project's central invariant boundary (all persistence goes through it), so it earns its own filter even as a single file.

## /n8-roadmap — 2026-08-27

- **Decision:** Four epics (#1 Infra & CI, #2 Core notes CRUD, #3 Tags & search, #4 Export/import/stats) mapped 1:1 to milestones M0–M3; M4: Audit has no epic.
  **Why:** Brief's milestone list maps cleanly to capabilities; audit findings attach to the epics they concern.
- **Decision:** Both invariants marked test-enforced; storage-boundary guard planned as a lint restriction on `node:fs` imports (only `src/storage.ts` may import it).
  **Why:** Expressible as build-time checks; prose rules rot.

## /n8-plan M0-M3 — 2026-08-27

- **Decision:** Note model fixed as `{id: uuid, title, body, tags: string[], createdAt: ISO-8601}`; title required, tags lowercase/deduped.
  **Why:** More than one defensible shape; execution must not guess. Simplest model covering all planned endpoints.
- **Decision:** Export/import endpoints named `GET /export` / `POST /import`; import uses **replace** semantics with full validation before a single atomic write.
  **Why:** Brief left endpoint names and merge-vs-replace open; replace is the simpler restore-from-backup semantic (brief: simpler option, log it).
- **Decision:** JSON file layout `{version:1, notes:{<id>:Note}}`, atomic writes via tmp+rename, whole-file rewrite per mutation, O(n) search — stated concretely in subtasks #11/#15/#19 and story ACs.
  **Why:** v1 explicitly excludes concurrency; the store is small; concrete mechanics keep execution unblocked.
- **Decision:** Cross-milestone dependencies wired only where data-real (M2/M3 stories blocked by #10, #16 by #14+#12, #20 by #18, #21 by #14); no blanket edges to CI stories.
  **Why:** Milestones execute in order anyway; edges carry real ordering, not ceremony.
- **Decision:** No project-specific skills proposed; audit emphases recorded in M4 description (data integrity, input robustness, storage-boundary guard, light performance).
  **Why:** Small local service; no plugin system, content format, or deploy runbook to earn a skill.

## /n8-exec M0,M1 — 2026-08-27

- **Decision:** `test/**` is exempt from the storage-boundary lint rule (deviation from #9's literal AC "any file except src/storage.ts fails lint").
  **Why:** M1's planned tests (#11: tmp-file/corrupt-file/atomicity checks; #10/#13: on-disk persistence checks) must inspect the data file directly — the AC as written would make the planned test plans unwritable. The invariant governs service code; the exemption carries a rationale comment in `eslint.config.mjs`. Low cost, reversible.
  **Issue:** #9
- **Decision:** Restricted bare `fs`/`fs/promises` specifiers in addition to the AC's `node:fs`/`node:fs/promises`.
  **Why:** They resolve to the same modules; leaving them open makes the guard trivially bypassable. Rule 2 (missing critical functionality within story scope).
  **Issue:** #9
- **Decision:** Added `"types": ["node"]` to `tsconfig.json`.
  **Why:** Rule 3 blocker — `tsc` (TypeScript 6.0.3) could not resolve `node:*` builtin module types despite `@types/node` being installed; the compiler's own suggested fix. Without it no code importing node builtins typechecks.
  **Issue:** #9 (surfaced writing the guard test)

### M1 entries

- **Decision:** Scaffold placeholder (`NAME` export in `src/index.ts` + `test/smoke.test.ts`) removed when the real entrypoint landed.
  **Why:** The entrypoint now has boot side effects; a test importing it would start a server. The smoke test's only purpose (scaffold sanity) is superseded by 18 real tests.
  **Issue:** #10
- **Decision:** List tie-break for identical `createdAt`: most recently created first (reverse insertion order; deterministic across reloads via JSON key order).
  **Why:** Delegated in #12's Claude's Discretion; "newest first" extended to ties is the least surprising reading.
  **Issue:** #12
- **Decision:** `DELETE` returns 204 with empty body.
  **Why:** #13's Claude's Discretion says "use 204" — followed as prescribed.
  **Issue:** #13
- **Decision:** Added a 500 catch-all around route handling (unhandled handler error → JSON 500, process survives).
  **Why:** Rule 2 — without it any handler rejection crashes or hangs the server; basic correctness for an HTTP service, not a feature.
  **Issue:** #10
