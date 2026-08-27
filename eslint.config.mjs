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
);
