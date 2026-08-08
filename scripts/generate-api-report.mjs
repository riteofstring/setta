import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, runPnpm } from "./lib/process.mjs";

runPnpm(["run", "build:package"]);

const declarationsDirectory = path.join(repositoryRoot, "packages/workspace/dist");
const declarationFiles = readdirSync(declarationsDirectory)
  .filter((name) => name.endsWith(".d.ts"))
  .sort();
const report = declarationFiles
  .map((name) => `## ${name}\n\n${readFileSync(path.join(declarationsDirectory, name), "utf8")}`)
  .join("\n");
const reportsDirectory = path.join(repositoryRoot, ".reports");
mkdirSync(reportsDirectory, { recursive: true });
writeFileSync(
  path.join(reportsDirectory, "public-api.md"),
  `# Generated public API review\n\n${report}`,
);

console.log("Generated .reports/public-api.md.");
