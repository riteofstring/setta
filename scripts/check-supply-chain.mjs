import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, run, runPnpm } from "./lib/process.mjs";

run(process.execPath, [path.join(repositoryRoot, "scripts/check-dependencies.mjs")]);

console.log("Clean frozen install...");
runPnpm(["install", "--frozen-lockfile"]);

console.log("Lockfile synchronization check...");
run(process.execPath, [path.join(repositoryRoot, "scripts/check-lockfile-sync.mjs")]);

console.log("Independent lockfile release-age audit...");
run(process.execPath, [path.join(repositoryRoot, "scripts/check-release-age.mjs")]);

console.log("Vulnerability audit...");
runPnpm(["audit", "--audit-level", "moderate"]);

console.log("License allowlist check...");
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

console.log("Dependency inventory...");
const inventory = runPnpm(["list", "--json", "--depth", "Infinity"], { capture: true });
writeFileSync(path.join(reportsDirectory, "dependencies.json"), inventory.stdout);

console.log("Supply-chain checks passed.");
