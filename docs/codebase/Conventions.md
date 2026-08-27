# Conventions

Codebase: TypeScript notes HTTP service. Source in `src/`, tests in `test/`, build output in `dist/` (git-ignored, never edit). Runtime: Node built-ins only (`node:http`, `node:sqlite`) — zero production dependencies (`package.json` has only `devDependencies`).

## Naming

- **Files**: lowercase single-word basenames — `src/storage.ts`, `src/server.ts`, `src/index.ts`. Tests mirror the module name: `test/storage.test.ts`, `test/server.test.ts`. Multi-word test files use kebab-case: `test/lint-guard.test.ts`.
- **Functions**: camelCase verbs — `makeServer`, `sendJson`, `readBody`, `parseCreate`, `rowToNote`, `migrateFromLegacyJson`. Type guards use the `isX` form: `isLegacyStoreFile`.
- **Types/classes/interfaces**: PascalCase — `Storage`, `Note`, `NoteRow`, `LegacyStoreFile`. No `I` prefix, no `Type` suffix.
- **Constants/env**: env vars are `NOTEAPI_`-prefixed SCREAMING_SNAKE (`NOTEAPI_FILE`, plus `PORT`), read only in `src/index.ts`:

```ts
const file = process.env.NOTEAPI_FILE ?? "./data/notes.db";
const port = Number(process.env.PORT ?? 3000);
```

## Module style

ESM throughout (`"type": "module"` in `package.json`, `"module": "NodeNext"` in `tsconfig.json`). Rules:

- Relative imports MUST carry a `.js` extension (NodeNext resolution), even from `.ts` files:

```ts
// src/index.ts
import { Storage } from "./storage.js";
import { makeServer } from "./server.js";
```

- Node built-ins MUST use the `node:` prefix: `import { createServer } from "node:http"`.
- Use `import type` / inline `type` specifiers for type-only imports:

```ts
// src/server.ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Storage } from "./storage.js";
```

- Top-level `await` is used in the entrypoint (`src/index.ts`: `const storage = await Storage.open(file);`).
- Named exports only; no default exports anywhere in `src/` or `test/`.
- Every file opens with a `//` comment block stating the module's purpose and any invariant it upholds. Follow this for new files.

## Architecture invariant: the storage boundary

`src/storage.ts` is the ONLY module allowed to touch persistence (filesystem or SQLite). Route handlers in `src/server.ts` call `Storage` methods only. This is enforced by lint (see below) and by `test/lint-guard.test.ts` — do not import `node:fs`, `fs`, `fs/promises`, `node:fs/promises`, or `node:sqlite` outside `src/storage.ts` (tests are exempt).

## Error handling

- **Fail loud at startup, never destroy user data.** `Storage.openSync` in `src/storage.ts` wraps low-level errors in a new `Error` that names the offending path, includes the underlying message, and chains via `{ cause }`:

```ts
throw new Error(
  `noteapi store at ${file} is not a usable SQLite database (${(err as Error).message}); refusing to overwrite it`,
  { cause: err },
);
```

- **Sync work behind an async facade**: `Storage.open` returns a `Promise` even though `node:sqlite` is synchronous, converting throws into rejections so callers' `await`/`.rejects` semantics hold:

```ts
static open(file: string): Promise<Storage> {
  try {
    return Promise.resolve(Storage.openSync(file));
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}
```

- **Request-level catch-all**: `makeServer` in `src/server.ts` catches any handler rejection so a bug never crashes the process or hangs the request — log with a `noteapi:` prefix, send 500 if headers not yet sent:

```ts
handle(storage, req, res).catch((err: unknown) => {
  console.error("noteapi: unhandled error", err);
  if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
  else res.end();
});
```

- **Expected absences are values, not exceptions**: `Storage.getNote` returns `Note | undefined`; `Storage.deleteNote` resolves `false` for an unknown id. Handlers translate these into 404s.
- SQLite multi-row writes wrap in explicit `BEGIN`/`COMMIT` with `ROLLBACK` in the catch (see `migrateFromLegacyJson` in `src/storage.ts`).

## HTTP response patterns

All JSON responses go through the single `sendJson` helper in `src/server.ts`:

```ts
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}
```

Status conventions: `200` reads, `201` create, `204` delete (empty body, bare `res.writeHead(204); res.end();`), `400` validation failure, `404` unknown route or id, `500` unhandled error. Every error body is the shape `{ error: string }` with a lowercase human-readable message (`{ error: "not found" }`). Routing is manual: `handle` splits `url.pathname` into segments and matches on `segments[0] === "notes"` + `segments.length` + `req.method`; path params are `decodeURIComponent`ed. Fall through to `sendJson(res, 404, { error: "not found" })`.

## Validation

Validate request payloads with a parse function that returns either the typed value or `{ error: string }` — no exceptions, no validation library. Pattern from `parseCreate` in `src/server.ts`:

```ts
function parseCreate(raw: string): { title: string; body: string } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "request body is not valid JSON" };
  }
  ...
  if (typeof title !== "string" || title.trim() === "") {
    return { error: "title is required and must be a non-empty string" };
  }
  ...
  return { title, body: body ?? "" };
}
```

Callers branch on `"error" in input` and answer 400. Parse unknown JSON as `unknown`, then narrow with `typeof` checks. For persisted-file shapes, use a named type-guard (`isLegacyStoreFile(value): value is LegacyStoreFile` in `src/storage.ts`). Optional fields get explicit defaults (`body ?? ""`).

## State management

- All persistent state lives in one SQLite database (`node:sqlite` `DatabaseSync`), owned by the `Storage` class in `src/storage.ts`. The `db` handle is `private readonly`; the constructor is `private` — instances come only from the static factory `Storage.open(file)`.
- No global mutable state. Dependencies flow by injection: `src/index.ts` opens `Storage` and passes it to `makeServer(storage)`; handlers receive it as a parameter.
- Row mapping is explicit: DB rows are typed as `NoteRow` (tags stored as a JSON-encoded string) and converted with `rowToNote`. Domain type `Note` keeps `tags: string[]` and `createdAt` as an ISO-8601 string.
- List ordering is defined in SQL, not application code: `ORDER BY createdAt DESC, rowid DESC` (newest first, reverse-insertion tie-break).

## Lint rules that shape code (`eslint.config.mjs`)

Flat config: `js.configs.recommended` + `tseslint.configs.recommendedTypeChecked` with `projectService: true`. Warnings are errors — `npm run lint` runs `eslint . --max-warnings 0` and CI enforces the same. Any rule suppression must carry a one-line rationale comment (stated in the config header).

The storage-boundary guard — `no-restricted-imports` bans persistence modules everywhere, with exemptions only for `src/storage.ts` and `test/**`:

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
// ...
{ files: ["src/storage.ts"], rules: { "no-restricted-imports": "off" } },
{ files: ["test/**"], rules: { "no-restricted-imports": "off" } },
```

`dist/`, `node_modules/`, and `data/` are ignored; `**/*.mjs` files get `disableTypeChecked`.

## TypeScript strictness (`tsconfig.json`)

Maximum strictness — write code that passes these before considering it done (`npm run typecheck` = `tsc --noEmit`):

```json
{
  "target": "ES2023",
  "module": "NodeNext",
  "moduleResolution": "NodeNext",
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "declaration": true,
  "sourceMap": true
}
```

Consequences to code with:

- `noUncheckedIndexedAccess`: indexing yields `T | undefined` — handle it (`decodeURIComponent(segments[1] ?? "")` in `src/server.ts`).
- `exactOptionalPropertyTypes`: do not assign `undefined` to optional properties.
- Type-checked lint bans unsafe `any` flows: cast raw DB/JSON results explicitly (`.get() as { n: number }`, `.all() as unknown as NoteRow[]`, `JSON.parse(row.tags) as string[]`).
- Builds use `tsconfig.build.json` (`rootDir: src`, includes `src` only); the root `tsconfig.json` includes `src` + `test` for typecheck and editors.

---
*Generated from commit `1ce69772275aff911e8ed7f0f4800d229b4c5e63` by /n8-map.*
