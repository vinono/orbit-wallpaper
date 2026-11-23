#!/usr/bin/env node
// Builds the self-contained wallpaper page from src/ + site/assets/.
//   node scripts/build.mjs
// Output: site/wallpaper.html — one file, no imports, no network, opens from file://.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "site");
const assets = join(site, "assets");

// ES module in, plain script out: drop import lines, drop the export keyword.
const strip = (code) =>
  code
    .replace(/^import\s[^;]+?;\s*$/gms, "")
    .replace(/^export\s+(?=(?:const|let|var|function|class|async))/gm, "")
    .trim();

const read = (path) => readFile(path, "utf8");

const [template, css, clock, config, wallpaper] = await Promise.all([
  read(join(root, "src/wallpaper.template.html")),
  read(join(assets, "clock.css")),
  read(join(assets, "clock.js")),
  read(join(assets, "config.js")),
  read(join(assets, "wallpaper.js")),
]);

const script = [clock, config, wallpaper].map(strip).join("\n\n");
if (/^\s*(import|export)\s/m.test(script)) {
  throw new Error("module syntax survived inlining — check clock.js/config.js/wallpaper.js");
}

const linkTag = '<link rel="stylesheet" href="./assets/clock.css" />';
const scriptTag = '<script type="module" src="./assets/wallpaper.js"></script>';
if (!template.includes(linkTag) || !template.includes(scriptTag)) {
  throw new Error("template is missing its clock.css / wallpaper.js tags");
}

const html = template
  .replace(linkTag, `<style>\n${css.trim()}\n</style>`)
  .replace('<link rel="icon" href="./favicon.svg" type="image/svg+xml" />', "")
  .replace(scriptTag, `<script type="module">\n${script}\n</script>`);

const out = join(site, "wallpaper.html");
await writeFile(out, html, "utf8");
console.log(`✓ wallpaper.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB  (self-contained)`);
