/** @type {import("jest").Config} */
module.exports = {
  roots: ["<rootDir>"],
  transform: {
    "^.+\\.jsx?$": require.resolve("./esbuild-transformer"),
  },
  moduleFileExtensions: ["js", "jsx", "json", "node"],
  modulePathIgnorePatterns: [
    "<rootDir>/test/__fixtures__",
    "<rootDir>/node_modules",
  ],
};
