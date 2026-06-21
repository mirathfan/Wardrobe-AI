import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "dist");

await rm(outDir, { force: true, recursive: true });
await mkdir(outDir, { recursive: true });

for (const entry of ["index.html", "styles.css", "script.js", "public"]) {
  await cp(join(root, entry), join(outDir, entry), { recursive: true });
}

console.log(`Built static site at ${outDir}`);
