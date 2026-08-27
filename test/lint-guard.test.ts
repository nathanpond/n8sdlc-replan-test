// Guard test for the storage-boundary lint rule (#9): importing node:fs outside
// src/storage.ts must be a lint error; src/storage.ts itself is exempt.
// Fixtures are linted in-memory with type-aware linting disabled (they don't
// exist on disk for the project service); no-restricted-imports needs no types.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

const root = path.resolve(import.meta.dirname, "..");

const eslint = new ESLint({
  cwd: root,
  overrideConfig: [
    { files: ["**/*.ts"], ...tseslint.configs.disableTypeChecked },
  ] as never,
});

async function restrictedImportErrors(code: string, filePath: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports").length;
}

describe("storage-boundary lint guard", () => {
  const fixture = (specifier: string) =>
    `import fs from "${specifier}";\nexport const present = typeof fs;\n`;

  it.each(["node:fs", "node:fs/promises", "fs", "fs/promises"])(
    "flags %s imported outside src/storage.ts",
    async (specifier) => {
      expect(await restrictedImportErrors(fixture(specifier), "src/not-storage.ts")).toBeGreaterThan(0);
    },
  );

  it("allows node:fs inside src/storage.ts", async () => {
    expect(await restrictedImportErrors(fixture("node:fs"), "src/storage.ts")).toBe(0);
    expect(await restrictedImportErrors(fixture("node:fs/promises"), "src/storage.ts")).toBe(0);
  });
});
