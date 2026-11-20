const nextPlugin = require("@next/eslint-plugin-next");
const libraryConfig = require("./library");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...libraryConfig,
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
