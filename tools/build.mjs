// Bundles src/ into public/game.js (minified, no source map).
// "node tools/build.mjs --test <file>" makes a test copy with hooks for automated checks.
import * as esbuild from "esbuild";

const testOut = process.argv[2] === "--test" ? process.argv[3] : null;

await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019", "safari14"],
  outfile: testOut || "public/game.js",
  define: { TEST_HOOKS: testOut ? "true" : "false" },
  legalComments: "eof",
  sourcemap: false,
  logLevel: "info",
});
