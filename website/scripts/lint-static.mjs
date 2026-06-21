import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const indexPath = join(root, "index.html");
const stylesPath = join(root, "styles.css");
const scriptPath = join(root, "script.js");

const index = readFileSync(indexPath, "utf8");
const styles = readFileSync(stylesPath, "utf8");
const script = readFileSync(scriptPath, "utf8");
const errors = [];

function fail(message) {
  errors.push(message);
}

const expectedMeta = [
  "<title>AURA — AI Personal Stylist</title>",
  'name="description"',
  'content="Build a digital closet, ask AURA what to wear, and plan outfits from clothes you already own."',
  'property="og:title" content="AURA — AI Personal Stylist"',
  'property="og:description"',
  'property="og:image" content="public/assets/hero-product-visual.webp"',
];

for (const token of expectedMeta) {
  if (!index.includes(token)) {
    fail(`Missing SEO metadata token: ${token}`);
  }
}

const refs = new Set();
for (const match of index.matchAll(/\b(?:src|href|content)="([^"]+)"/g)) {
  const value = match[1];
  if (
    value === "styles.css" ||
    value === "script.js" ||
    value.startsWith("public/")
  ) {
    refs.add(value);
  }
}

for (const ref of refs) {
  if (!existsSync(join(root, ref))) {
    fail(`Missing referenced asset: ${ref}`);
  }
}

const rawScreenRefs = [
  "today-look-screen.webp",
  "aura-chat-screen.webp",
  "closet-grid-screen.webp",
  "product-import-screen.webp",
  "calendar-screen.webp",
  "insights-screen.webp",
];

for (const ref of rawScreenRefs) {
  if (index.includes(`public/assets/${ref}`)) {
    fail(`Public markup references an unsanitized app screenshot: ${ref}`);
  }
}

if (/TestFlight/i.test(`${index}\n${styles}\n${script}`)) {
  fail("Public source still contains TestFlight text.");
}

const primaryFeatureCount = (index.match(/feature-card-large/g) || []).length;
if (primaryFeatureCount !== 6) {
  fail(`Expected 6 primary feature cards, found ${primaryFeatureCount}.`);
}

const secondaryMatch = index.match(
  /<div class="feature-secondary-list"[\s\S]*?<\/div>\s*<\/section>/,
);
const secondaryFeatureCount = secondaryMatch
  ? (secondaryMatch[0].match(/<article>/g) || []).length
  : 0;
if (secondaryFeatureCount !== 6) {
  fail(`Expected 6 secondary feature items, found ${secondaryFeatureCount}.`);
}

for (const token of ['id="name"', 'id="email"', "Request Early Access"]) {
  if (!index.includes(token)) {
    fail(`Missing waitlist form token: ${token}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("Static lint passed.");
