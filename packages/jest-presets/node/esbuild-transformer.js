const { extname } = require("node:path");
const { transformSync } = require("esbuild");

module.exports = {
  process(sourceText, sourcePath) {
    const loader = extname(sourcePath) === ".jsx" ? "jsx" : "js";
    const { code, map } = transformSync(sourceText, {
      format: "cjs",
      loader,
      sourcemap: "inline",
      sourcefile: sourcePath,
      target: "node24",
    });

    return { code, map };
  },
};
