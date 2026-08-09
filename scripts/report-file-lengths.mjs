import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { listProjectFiles } from "./lib/files.mjs";
import { repositoryRoot } from "./lib/process.mjs";

const rows = listProjectFiles()
  .filter((relativePath) => relativePath.endsWith(".ts") || relativePath.endsWith(".tsx"))
  .map((relativePath) => ({
    path: relativePath,
    lines: readFileSync(path.join(repositoryRoot, relativePath), "utf8").split("\n").length,
  }))
  .sort((left, right) => right.lines - left.lines);

const reportsDirectory = path.join(repositoryRoot, ".reports");
mkdirSync(reportsDirectory, { recursive: true });
writeFileSync(
  path.join(reportsDirectory, "file-lengths.json"),
  `${JSON.stringify(rows, null, 2)}\n`,
);
console.log("Generated .reports/file-lengths.json.");
