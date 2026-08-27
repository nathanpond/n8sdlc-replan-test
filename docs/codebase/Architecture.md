# Architecture

noteapi is a minimal local HTTP notes service: TypeScript, `node:http` (no framework), SQLite persistence via Node's built-in `node:sqlite` (requires Node 22.13+). Three source files, three layers, one hard boundary.

## Components

| Component | File | Role |
|---|---|---|
| Entry point | `src/index.ts` | Reads env config, opens storage, starts the server |
| HTTP layer | `src/server.ts` | Router + request parsing/validation + JSON responses |
| Storage layer | `src/storage.ts` | The ONLY module that touches persistence (SQLite + filesystem) |

### Entry point — `src/index.ts`

Wires config → storage → server. All configuration is environment variables; there is no config file.

```ts
const file = process.env.NOTEAPI_FILE ?? "./data/notes.db";
const port = Number(process.env.PORT ?? 3000);

const storage = await Storage.open(file);
makeServer(storage).listen(port, () => { ... });
```

`NOTEAPI_FILE` is the SQLite database path; `PORT` defaults to 3000. Nothing else lives here — do not add logic to `src/index.ts` beyond wiring.

### HTTP layer — `src/server.ts`

`makeServer(storage: Storage): Server` builds a `node:http` server. Storage is injected via this factory — never imported as a singleton or constructed inside the HTTP layer. Tests exploit this by passing a temp-database `Storage`.

Routing is manual path-segment matching inside one `async function handle(...)` — there is no router library and no route table. The pattern:

```ts
const url = new URL(req.url ?? "/", "http://localhost");
const segments = url.pathname.split("/").filter((s) => s !== "");

if (segments[0] === "notes") {
  if (segments.length === 1 && req.method === "GET") {
    return sendJson(res, 200, storage.listNotes());
  }
  if (segments.length === 1 && req.method === "POST") {
    const input = parseCreate(await readBody(req));
    if ("error" in input) return sendJson(res, 400, { error: input.error });
    return sendJson(res, 201, await storage.createNote(input));
  }
  ...
}
sendJson(res, 404, { error: "not found" }); // fall-through
```

Add new endpoints as further `segments`/`req.method` branches in `handle` in `src/server.ts`, following this exact shape. Path params come from `decodeURIComponent(segments[1] ?? "")`.

Conventions to follow in this layer:

- **All responses are JSON** via the `sendJson(res, status, payload)` helper (sets `content-type: application/json`), except 204 which uses bare `res.writeHead(204); res.end()`.
- **Errors are `{ error: string }`**: 400 for bad input, 404 as `{ error: "not found" }`, 500 as `{ error: "internal error" }`.
- **Body validation lives in dedicated parse functions** returning a union — see `parseCreate(raw: string): { title: string; body: string } | { error: string }` in `src/server.ts`. Write a `parseX` function for each new write endpoint; validate types field-by-field on `unknown`.
- **Crash safety**: `makeServer` wraps `handle` in a `.catch` that logs and sends 500 (or ends the response if headers were sent). Handler code can throw freely; do not add per-route try/catch for generic failures.

```ts
export function makeServer(storage: Storage): Server {
  return createServer((req, res) => {
    handle(storage, req, res).catch((err: unknown) => {
      console.error("noteapi: unhandled error", err);
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      else res.end();
    });
  });
}
```

### Storage layer — `src/storage.ts`

Exports the `Note` domain type and the `Storage` class. `Storage` wraps a `node:sqlite` `DatabaseSync` handle; the constructor is private and instances come from the async factory:

```ts
export class Storage {
  private constructor(private readonly db: DatabaseSync) {}
  static open(file: string): Promise<Storage> { ... }
  createNote(input: { title: string; body: string }): Promise<Note>
  getNote(id: string): Note | undefined
  deleteNote(id: string): Promise<boolean>
  listNotes(): Note[]
  close(): void
}
```

Note the deliberate signature asymmetry: **mutations return Promises, reads are synchronous**. `node:sqlite` is synchronous, so `createNote`/`deleteNote` wrap results in `Promise.resolve(...)` — this keeps callers' `await` semantics stable if the backend ever needs async I/O. New write methods must return Promises the same way; new read methods stay sync. `Storage.open` follows the same rule: work is sync, but failures surface as a rejected promise:

```ts
static open(file: string): Promise<Storage> {
  try {
    return Promise.resolve(Storage.openSync(file));
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}
```

Schema (created idempotently in `openSync` with `CREATE TABLE IF NOT EXISTS notes`): `id TEXT PRIMARY KEY, title, body, tags, createdAt` — all `TEXT NOT NULL`. `tags` is a JSON-encoded `string[]`; the private `NoteRow` interface plus `rowToNote(row)` handle row↔domain conversion (`JSON.parse` on tags). Any new column that isn't a scalar follows the JSON-in-TEXT pattern.

Safety invariants in `openSync`:
- Parent directory is created with `mkdirSync(path.dirname(file), { recursive: true })`.
- A file that exists but is not SQLite is a **hard startup error naming the path** — user data is never silently overwritten.

Legacy JSON import: on open, if `<name>.json` sits beside the DB (e.g. `data/notes.json` beside `data/notes.db`) and the `notes` table is empty, `migrateFromLegacyJson` imports its notes once inside a `BEGIN`/`COMMIT`/`ROLLBACK` transaction, in original key order (rowid preserves insertion order for list tie-breaks). The JSON file is never modified. Unrecognized or invalid JSON is a hard startup error, not a skip.

Ordering contract: `listNotes()` returns newest first — `ORDER BY createdAt DESC, rowid DESC`. Preserve this in any new listing query.

## The storage-boundary invariant (lint-enforced)

**Only `src/storage.ts` may touch persistence** (filesystem or SQLite). This is invariant #9 in `CLAUDE.md` and is machine-enforced, not convention:

1. `eslint.config.mjs` bans the imports everywhere via `no-restricted-imports`:

```js
"no-restricted-imports": [
  "error",
  {
    paths: ["node:fs", "node:fs/promises", "fs", "fs/promises", "node:sqlite"].map((name) => ({
      name,
      message: "All persistence goes through src/storage.ts (storage-boundary invariant).",
    })),
  },
],
```

   Two exemption blocks follow: `files: ["src/storage.ts"]` (it IS the boundary) and `files: ["test/**"]` (tests must inspect data files/DBs directly to prove storage behavior).

2. `test/lint-guard.test.ts` is a meta-test that lints in-memory fixtures with the ESLint API and asserts each banned specifier errors outside `src/storage.ts` and passes inside it. If you change the lint rule, this test must change with it.

3. Lint warnings are errors: `npm run lint` runs `eslint . --max-warnings 0` (invariant #7, enforced in `.github/workflows/ci.yml`).

Consequence for new code: anything needing a file, a directory, or a query gets a new **method on `Storage` in `src/storage.ts`**, and the HTTP layer calls that method. Never import `node:fs`/`node:sqlite` in `src/server.ts`, `src/index.ts`, or any new `src/` file. Amending this invariant is a user decision — see the drift protocol in `CLAUDE.md` (`.n8/decisions.md` + `/n8-replan`).

## Data flow: request → response → persistence

```
client HTTP request
  → node:http createServer callback (src/server.ts makeServer)
    → handle(storage, req, res)                       [src/server.ts]
      → URL parse + segment/method match               (manual routing)
      → readBody(req) + parseCreate(raw)               (writes only; 400 on bad input)
      → storage.createNote / getNote / deleteNote / listNotes   [src/storage.ts]
        → prepared SQL against DatabaseSync            (node:sqlite)
        → SQLite file at NOTEAPI_FILE (default ./data/notes.db)
      → sendJson(res, status, payload)                 (201/200/404) or 204
    → .catch → console.error + 500 { error: "internal error" }
```

Domain objects (`Note`) are constructed in `src/storage.ts` (`randomUUID()` id, `new Date().toISOString()` createdAt, `tags: []`) and serialized as-is by `sendJson` — there is no DTO/mapping layer between storage and HTTP.

## Current API surface

| Method + path | Handler branch in `src/server.ts` | Responses |
|---|---|---|
| `GET /notes` | `segments.length === 1 && GET` | 200 `Note[]` newest-first |
| `POST /notes` | `segments.length === 1 && POST` | 201 `Note`; 400 `{ error }` |
| `GET /notes/:id` | `segments.length === 2 && GET` | 200 `Note`; 404 |
| `DELETE /notes/:id` | `segments.length === 2 && DELETE` | 204 empty; 404 |
| anything else | fall-through | 404 `{ error: "not found" }` |

No auth, single-user, local-only by design (see `README.md`).

---
*Generated from commit `1ce69772275aff911e8ed7f0f4800d229b4c5e63` by /n8-map.*
