import { readFileSync } from "node:fs";
import path from "node:path";

import { isTestFile, selectFiles } from "./lib/files.mjs";
import { repositoryRoot } from "./lib/process.mjs";

// Ceiling ratification is documented in docs/quality-and-supply-chain-tooling.md.
const sourceLineCeiling = 1_300;
const testLineCeiling = 1_500;

function isLengthCheckedFile(relativePath) {
  return /\.(?:js|mjs|ts|tsx)$/.test(relativePath);
}

const violations = selectFiles(process.argv.slice(2))
  .filter(isLengthCheckedFile)
  .flatMap((relativePath) => {
    const content = readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    const lineCount = content === "" ? 0 : content.split("\n").length;
    const limit = isTestFile(relativePath) ? testLineCeiling : sourceLineCeiling;
    return lineCount > limit ? [`${relativePath}: ${lineCount} lines exceeds ${limit}`] : [];
  });

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("File-length limits passed.");
