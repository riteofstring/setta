import { readFileSync } from "node:fs";
import path from "node:path";

import { selectFiles } from "./lib/files.mjs";
import { repositoryRoot } from "./lib/process.mjs";

function isTypeScript(relativePath) {
  return relativePath.endsWith(".ts") || relativePath.endsWith(".tsx");
}

function isTest(relativePath) {
  return relativePath.includes("/tests/") || relativePath.includes(".test.");
}

const violations = selectFiles(process.argv.slice(2))
  .filter(isTypeScript)
  .flatMap((relativePath) => {
    const content = readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    const lineCount = content === "" ? 0 : content.split("\n").length;
    const limit = isTest(relativePath) ? 1_200 : 1_000;
    return lineCount > limit ? [`${relativePath}: ${lineCount} lines exceeds ${limit}`] : [];
  });

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("File-length limits passed.");
