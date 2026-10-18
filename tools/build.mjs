// Bundles src/ into public/game.js (minified, no source map).
// "node tools/build.mjs --test <file>" makes a test copy with hooks for automated checks.
import * as esbuild from "esbuild";
import fs from "fs";
import crypto from "crypto";

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

// Stamp index.html with a fingerprint of the game and the stylesheet, so a browser
// can never keep running an old copy after an update.
if (!testOut) {
  const tag = (f) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex").slice(0, 10);
  let html = fs.readFileSync("public/index.html", "utf8");
  html = html.replace(/src="game\.js(\?v=[^"]*)?"/, `src="game.js?v=${tag("public/game.js")}"`)
    .replace(/href="style\.css(\?v=[^"]*)?"/, `href="style.css?v=${tag("public/style.css")}"`);
  fs.writeFileSync("public/index.html", html);
}
