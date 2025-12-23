import globals from "globals";

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        chrome: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-undef": "error",
      "no-console": "off",
      "semi": ["error", "always"],
      "quotes": ["error", "single", { "avoidEscape": true }],
      "indent": ["error", 2],
      "no-trailing-spaces": "error",
      "eol-last": ["error", "always"]
    }
  }
];
