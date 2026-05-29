import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requiredPaths = [
  "AGENTS.md",
  "README.md",
  ".env.example",
  "apps/api/package.json",
  "apps/desktop/package.json",
  "apps/worker/package.json",
  "packages/domain/package.json",
  "docs/design/memo-capture-design-learnings.md"
];

const missing = requiredPaths.filter((path) => !existsSync(join(root, path)));

if (missing.length > 0) {
  console.error("Memo Capture doctor failed. Missing required paths:");
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

const pkg = require(join(root, "package.json"));

console.log(`Memo Capture ${pkg.version}`);
console.log("Required bootstrap files are present.");
console.log("Run npm install before typecheck, tests, builds, or dev servers.");
