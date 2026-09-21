import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [path.join(here, "src", "panel.ts")],
  bundle: true,
  outfile: path.join(dist, "index.js"),
  format: "cjs",
  platform: "neutral",
  target: "es2020",
  external: ["uxp", "indesign"],
  mainFields: ["module", "main"],
  conditions: ["import", "default"],
  define: { __PLUGIN_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")) },
  logLevel: "warning",
});
cpSync(path.join(here, "manifest.json"), path.join(dist, "manifest.json"));
cpSync(path.join(here, "index.html"), path.join(dist, "index.html"));
console.log(`UXP plugin built to ${dist}; load dist/manifest.json in UXP Developer Tool`);
