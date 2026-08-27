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
