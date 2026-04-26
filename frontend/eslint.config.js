// eslint.config.js
import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";

export default [
  js.configs.recommended,
  {
    basePath: "..",
    files: [
      "frontend/src/**/*.{js,jsx,ts,tsx}",
      "frontend/plugin-sdk/app-subsystem/src/**/*.{js,jsx,ts,tsx}",
      "plugin-sdk/app-subsystem/src/**/*.{js,jsx,ts,tsx}",
      "plugins/*/frontend/src/**/*.{js,jsx,ts,tsx}",
    ],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        browser: true,
        es2021: true,
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      react: react,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/display-name": "off",
      "no-undef": "off",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];
