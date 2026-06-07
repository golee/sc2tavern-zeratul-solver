import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "memo/**",
      "node_modules/**",
      "vendor/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["*.js", "src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
];
