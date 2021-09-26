module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ["eslint:recommended", "plugin:react/recommended"],
  parser: "babel-eslint",
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    sourceType: "module",
  },
  plugins: ["unused-imports"],
  rules: {
    "react/prop-types": "off",
    "react/react-in-jsx-scope": "off",
    "react/display-name": "off",
    "unused-imports/no-unused-imports": "warn",
    "no-unused-vars": "off",
    "no-undef": "off",
    "react/jsx-uses-react": "warn",
    "react/jsx-uses-vars": "warn",
    "react/jsx-no-duplicate-props": "warn",
    "react/no-children-prop": "warn",
    "no-constant-condition": "warn",
  },
};
