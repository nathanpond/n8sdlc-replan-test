// ESLint flat config — typescript-eslint recommended-type-checked.
// Lint warnings are errors in CI (invariant: `--max-warnings 0`).
// No rules are tuned down yet; any future suppression must carry a one-line rationale.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "data/"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Storage-boundary invariant (#9): only src/storage.ts may touch the
    // persistence layer (filesystem or SQLite database). Bare "fs"/"fs/promises"
    // resolve to the same modules as the node: forms, so they are restricted
    // too; "node:sqlite" has no bare form.
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["node:fs", "node:fs/promises", "fs", "fs/promises", "node:sqlite"].map((name) => ({
            name,
            message: "All persistence goes through src/storage.ts (storage-boundary invariant).",
          })),
        },
      ],
    },
  },
  {
    // Exempt: src/storage.ts IS the persistence boundary the rule protects.
    files: ["src/storage.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // Exempt: tests must inspect the data file directly (temp stores, atomic-write
    // and corruption checks) to prove storage behavior; the invariant governs
    // service code, not its proofs.
    files: ["test/**"],
    rules: { "no-restricted-imports": "off" },
  },
);
