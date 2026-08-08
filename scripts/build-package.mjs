import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const packageRoot = path.join(repositoryRoot, "packages/workspace");
const outputDirectory = path.join(packageRoot, "dist");

rmSync(outputDirectory, { force: true, recursive: true });
mkdirSync(outputDirectory, { recursive: true });
runPnpm(["exec", "tsc", "-p", "packages/workspace/tsconfig.build.json", "--pretty", "false"]);
copyFileSync(path.join(packageRoot, "src/styles.css"), path.join(outputDirectory, "styles.css"));

console.log("Built @setta/workspace.");
