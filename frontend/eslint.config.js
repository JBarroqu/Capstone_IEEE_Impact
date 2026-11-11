// Lint for correctness, not style (CI runs `npm run lint`). TypeScript's recommended rules plus the rules of hooks.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser }, ecmaVersion: 2022 },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // The classic hook rules. The React Compiler rules in v7's preset are left off: the app doesn't use the compiler.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // `_name` marks a value left out on purpose (e.g. dropping fields with a rest spread).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      // The API client and admin tables pass loosely typed JSON on purpose; `tsc --strict` still checks everything else.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
