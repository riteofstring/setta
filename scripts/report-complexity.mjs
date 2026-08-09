import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const result = runPnpm(
  ["exec", "eslint", ".", "--format", "json", "--rule", 'complexity:["warn",0]'],
  { allowFailure: true, capture: true },
);
if (result.status > 1) {
  throw new Error(`ESLint complexity report failed.\n${result.stderr || result.stdout}`);
}

const reportsDirectory = path.join(repositoryRoot, ".reports");
mkdirSync(reportsDirectory, { recursive: true });
writeFileSync(path.join(reportsDirectory, "complexity.json"), result.stdout);
console.log("Generated .reports/complexity.json.");
