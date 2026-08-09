import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, run, runPnpm } from "./lib/process.mjs";

run(process.execPath, [path.join(repositoryRoot, "scripts/check-dependencies.mjs")]);
runPnpm(["install", "--frozen-lockfile"]);
runPnpm(["audit", "--audit-level", "high"]);

const licenses = runPnpm(["licenses", "list", "--json"], { capture: true });
const licenseInventory = JSON.parse(licenses.stdout);
const licensePolicy = JSON.parse(
  readFileSync(path.join(repositoryRoot, "dependency-license-policy.json"), "utf8"),
);
const unapprovedLicenses = Object.keys(licenseInventory).filter(
  (license) => !licensePolicy.allowedSpdxExpressions.includes(license),
);
if (unapprovedLicenses.length > 0) {
  throw new Error(`Unapproved dependency licenses: ${unapprovedLicenses.join(", ")}`);
}

const reportsDirectory = path.join(repositoryRoot, ".reports");
mkdirSync(reportsDirectory, { recursive: true });
writeFileSync(path.join(reportsDirectory, "licenses.json"), licenses.stdout);
run(process.execPath, [path.join(repositoryRoot, "scripts/generate-dependency-inventory.mjs")]);

console.log("Supply-chain audit passed.");
