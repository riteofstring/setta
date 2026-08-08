import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const result = runPnpm(["list", "--json", "--depth", "Infinity"], { capture: true });
const reportsDirectory = path.join(repositoryRoot, ".reports");
mkdirSync(reportsDirectory, { recursive: true });
writeFileSync(path.join(reportsDirectory, "dependencies.json"), result.stdout);

console.log("Generated .reports/dependencies.json.");
