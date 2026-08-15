import { readFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const result = runPnpm(["licenses", "list", "--json"], { capture: true });
const inventory = JSON.parse(result.stdout);
const policy = JSON.parse(
  readFileSync(path.join(repositoryRoot, "dependency-license-policy.json"), "utf8"),
);
const unapproved = Object.keys(inventory).filter(
  (license) => !policy.allowedSpdxExpressions.includes(license),
);

if (unapproved.length > 0) {
  console.error(`Unapproved dependency licenses: ${unapproved.join(", ")}`);
  process.exit(1);
}

console.log("Dependency licenses satisfy the target allowlist.");
