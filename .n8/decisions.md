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

## Ad-hoc — 2026-08-27

- **Change:** Storage engine switched from the single JSON file (`{version:1, notes:{...}}`, atomic tmp+rename writes) to a SQLite database via Node's built-in `node:sqlite` (`NOTEAPI_FILE` default now `./data/notes.db`). The `src/storage.ts` interface is unchanged, so the HTTP layer did not change. One-time startup migration: a legacy `notes.json` next to the DB is imported when the DB is empty, then left untouched. The storage-boundary lint guard now also restricts `node:sqlite` imports to `src/storage.ts` (same spirit as the bare-`fs` extension logged under #9).
  **Why:** User decision this session: the JSON file won't cut it; move to SQLite using the built-in module (no new dependency — CI's Node 22.x and local Node 24 both ship unflagged `node:sqlite`).
  **Affects:** M2 Tags & search — #15 ("Default missing tags on JSON-file load; reuse the atomic persist") is stale as written (no JSON load or atomic persist to reuse; the migration already defaults missing tags), and #14/#16/#17 ACs that lean on JSON-file mechanics. M3 Export/import/stats — #19 ("Assemble the dump deterministically from the JSON-file store") and the /n8-plan decision that import does "a single atomic write" of the JSON file (#18/#20/#21) need re-stating against SQLite. The /n8-plan "JSON file layout" decision is superseded. Note: the JSON dump *format* for export/import can stay; only the store it reads/writes changed. — reconciled by /n8-replan 2026-08-27

## /n8-replan — 2026-08-27

Cause: the ad-hoc storage swap above (JSON file → SQLite via node:sqlite, PR #26). Scope: all planned-but-unexecuted milestones (M2, M3, M4). User approved the full change set.

- **Decision:** Rewrote SQLite-facing AC/mechanics on #14, #16, #17 (M2) and #18, #19, #20, #21 (M3); #19 retitled "…from the SQLite store". #20's atomicity contract is now "single SQLite transaction with rollback" (was tmp+rename); #14's persistence AC names the SQLite row. Epic #3 Notes updated; epic-level AC on #3/#4 unchanged (storage-agnostic).
  **Why:** Stale-what/stale-how per issue — the plans prescribed JSON-file mechanics that no longer exist.
  **Issues:** #3, #14, #16–#21
- **Decision:** Closed #15 as not planned (invalidated): the #26 migration already defaults missing tags, and there is no JSON load path or shared atomic persist left to prescribe.
  **Why:** Both of the subtask's jobs are gone; a rewritten version would prescribe an obvious one-line UPDATE.
  **Issue:** #15
- **Decision:** Updated milestone descriptions: M2 (dropped subtask #15) and M4 Audit (emphases restated — transactional import, non-SQLite-file refusal, legacy-JSON migration, node:sqlite boundary guard; dropped tmp+rename/whole-file-rewrite items). M4 was outside the ledger entry's "Affects" list but is planned-but-unexecuted and referenced the old mechanics.
  **Why:** Milestone descriptions are plan state too; leaving M4's stale emphases would steer the audit at code that no longer exists.
- **Decision:** No new issues and no dependency re-wires.
  **Why:** The migration and the node:sqlite lint-guard extension already shipped in #26; every existing blocked-by edge (#14←#10, #16←#14,#12, #17←#10, #18←#10, #20←#18, #21←#14) remains valid. Duplicate-checked against the full backlog.
- **Decision:** While rewriting #19, fixed a pre-existing self-reference typo (import is #20, not #19) and scoped the byte-identical-dumps check to exclude `exportedAt` (two exports can never be byte-identical while the timestamp is in the dump).
  **Why:** Encountered mechanically during the rewrite; leaving known errors in a freshly reconciled plan would be false fidelity.
  **Issue:** #19
