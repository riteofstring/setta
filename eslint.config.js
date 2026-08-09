import eslint from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";

// Threshold sources are documented in docs/quality-and-supply-chain-tooling.md.
const sourceComplexityRules = {
  complexity: ["error", 9],
  "max-depth": ["error", 4],
  "max-params": ["error", 5],
};
const testComplexityRules = {
  complexity: ["error", 9],
};
const testFilePatterns = [
  "**/*.test.{js,mjs,ts,tsx}",
  "**/*.spec.{js,mjs,ts,tsx}",
  "**/tests/**/*.{js,mjs,ts,tsx}",
  "**/__tests__/**/*.{js,mjs,ts,tsx}",
];

const ignoredPaths = [".reports/**", "coverage/**", "dist/**", "node_modules/**"];

export default [
  { ignores: ignoredPaths },
  {
    ...eslint.configs.recommended,
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...sourceComplexityRules,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
      ...sourceComplexityRules,
    },
  },
  {
    files: testFilePatterns,
    rules: {
      ...testComplexityRules,
      "max-depth": "off",
      "max-params": "off",
    },
  },
];
