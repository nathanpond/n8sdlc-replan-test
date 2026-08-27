# Testing

## Framework

Vitest 4 (`vitest@4.1.11` per `package-lock.json`; `"vitest": "^4.1.11"` in `package.json` devDependencies). No vitest config file exists — defaults apply, which pick up `test/**/*.test.ts`. Import test primitives from `"vitest"`:

```ts
import { afterEach, describe, expect, it } from "vitest";
```

## Organization

All tests live in `test/`, named `<module>.test.ts` after the `src/` module under test (kebab-case for multi-word names):

- `test/storage.test.ts` — unit tests for `src/storage.ts` (SQLite persistence + legacy JSON import)
- `test/server.test.ts` — HTTP integration tests for `src/server.ts` (real server, real `fetch`)
- `test/lint-guard.test.ts` — meta-test enforcing the storage-boundary lint rule

Tests import source directly with `.js` extensions: `import { Storage, type Note } from "../src/storage.js";`. `test/` is included in the root `tsconfig.json` (so `npm run typecheck` covers tests) but excluded from `tsconfig.build.json`. `test/**` is exempt from the `no-restricted-imports` storage guard in `eslint.config.mjs` — tests may import `node:fs`/`node:sqlite` to inspect data files directly.

## Commands

Run from the repo root:

```sh
npm test              # vitest run (single pass, no watch)
npx vitest run test/server.test.ts   # one file
npm run typecheck     # tsc --noEmit
npm run lint          # eslint . --max-warnings 0  (warnings ARE errors)
npm run build         # tsc -p tsconfig.build.json
```

## Patterns

### Server tests (`test/server.test.ts`): real server on an ephemeral port

Boot the real HTTP server against a temp SQLite file, listen on port 0, and hit it with global `fetch`. Track servers in a module-level array and close them all in `afterEach`:

```ts
const servers: Server[] = [];

async function boot(file: string): Promise<string> {
  const storage = await Storage.open(file);
  const server = makeServer(storage);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});
```

Restart-persistence tests call `boot(file)` a second time on the same file and assert data survives. Response bodies are cast to domain types: `(await res.json()) as Note`.

### Storage tests (`test/storage.test.ts`): per-test temp directories

Every test isolates state with its own `mkdtemp` directory under `os.tmpdir()`; the path includes a not-yet-existing `nested/` segment to prove the `mkdir -p` bootstrap in `Storage.open`:

```ts
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "noteapi-"));
  // Nested, not-yet-existing parent to prove mkdir -p bootstrap.
  return path.join(dir, "nested");
}

async function tempStorePath(): Promise<string> {
  return path.join(await tempDir(), "notes.db");
}
```

There is no shared fixture state and no `beforeEach` — each `it` builds its own store. Tests prove on-disk behavior by opening the database directly with `new DatabaseSync(file)` and querying rows, and by `readFile`-ing legacy JSON files to assert they are byte-for-byte untouched. Startup failures are asserted with `await expect(Storage.open(dbFile)).rejects.toThrow(legacy)` — error messages must name the offending path, and tests rely on that. Always `storage.close()` handles you open.

### Lint guard (`test/lint-guard.test.ts`): the storage boundary is tested, not just configured

This test runs ESLint programmatically (`new ESLint({ cwd: root, ... })` with type-aware linting disabled) over in-memory fixtures, and enforces that:

- Importing any of `node:fs`, `node:fs/promises`, `fs`, `fs/promises`, `node:sqlite` from a file positioned at `src/not-storage.ts` produces at least one `no-restricted-imports` error.
- The same imports positioned at `src/storage.ts` produce zero errors.

```ts
it.each(["node:fs", "node:fs/promises", "fs", "fs/promises", "node:sqlite"])(
  "flags %s imported outside src/storage.ts",
  async (specifier) => {
    expect(await restrictedImportErrors(fixture(specifier), "src/not-storage.ts")).toBeGreaterThan(0);
  },
);
```

If you change the restricted-import list or its exemptions in `eslint.config.mjs`, update this test in the same change.

## CI (`.github/workflows/ci.yml`)

One `ci` job on `pull_request` targeting `main`, Node 22 on `ubuntu-latest`, with npm cache and `contents: read` permissions. It runs, in order:

```sh
npm ci
npx tsc --noEmit
npx eslint . --max-warnings 0   # lint warnings are errors
npx vitest run
```

Superseded PR builds are cancelled via a `ci-pr-<number>` concurrency group. Match CI locally before pushing: `npm run typecheck && npm run lint && npm test`.

---
*Generated from commit `1ce69772275aff911e8ed7f0f4800d229b4c5e63` by /n8-map.*
