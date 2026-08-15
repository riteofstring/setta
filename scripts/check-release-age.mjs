import { readFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./lib/process.mjs";

const registryUrl = "https://registry.npmjs.org";
const maxConcurrentRequests = 8;
const lockfilePath = path.join(repositoryRoot, "pnpm-lock.yaml");

function readPolicyDays() {
  const policy = JSON.parse(readFileSync(path.join(repositoryRoot, ".code-policy.json"), "utf8"));
  const days = policy.supplyChain?.minimumReleaseAgeDays;
  if (!Number.isInteger(days) || days < 7) {
    throw new Error(".code-policy.json: supplyChain.minimumReleaseAgeDays must be at least 7");
  }
  return days;
}

function readExclusions() {
  const policy = JSON.parse(readFileSync(path.join(repositoryRoot, ".code-policy.json"), "utf8"));
  return new Set(
    (policy.exceptions ?? [])
      .filter((exception) => exception.check === "supplyChain.releaseAge")
      .map((exception) => exception.subject),
  );
}

function packageKeyFromLine(rawLine) {
  if (!rawLine.startsWith("  ") || rawLine.startsWith("    ")) {
    return null;
  }
  const stripped = rawLine.trim();
  if (!stripped.endsWith(":")) {
    return null;
  }
  const key = stripped
    .slice(0, -1)
    .trim()
    .replace(/^['"]|['"]$/gu, "");
  return key || null;
}

function scanPackageKeys(lockfileText) {
  const packageKeys = [];
  let inPackages = false;
  for (const rawLine of lockfileText.split("\n")) {
    if (rawLine === "packages:") {
      inPackages = true;
      continue;
    }
    if (!inPackages || !rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }
    if (!rawLine.startsWith(" ")) {
      break;
    }
    const key = packageKeyFromLine(rawLine);
    if (key !== null) {
      packageKeys.push(key);
    }
  }
  return packageKeys;
}

function loadPackageKeys(lockfileText) {
  const packageKeys = scanPackageKeys(lockfileText);
  if (lockfileText.includes("packages:") && packageKeys.length === 0) {
    throw new Error("pnpm-lock.yaml has a packages section but no parsable package entries.");
  }
  return packageKeys;
}

function parseRegistryPackage(rawKey) {
  const baseKey = rawKey.split("(", 1)[0];
  const separatorIndex = baseKey.lastIndexOf("@");
  if (separatorIndex <= 0) {
    return null;
  }

  let packageName = baseKey.slice(0, separatorIndex).replace(/^\//u, "");
  const version = baseKey.slice(separatorIndex + 1);
  if (!packageName || !version) {
    return null;
  }
  if (packageName.includes("@npm:")) {
    packageName = packageName.split("@npm:")[1];
  }
  if (packageName.includes("://") || /^(?:file|link|workspace):/.test(version)) {
    return null;
  }
  return { packageName, version };
}

async function fetchPackageTimes(packageName) {
  const metadataUrl = `${registryUrl}/${encodeURIComponent(packageName)}`;
  const response = await fetch(metadataUrl, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Failed to load npm metadata for ${packageName}: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (typeof payload.time !== "object" || payload.time === null) {
    throw new Error(`npm metadata for ${packageName} did not include a usable version time map.`);
  }
  return payload.time;
}

async function loadTimeMaps(packageNames) {
  const names = [...packageNames];
  const timeMaps = new Map();
  const workers = Array.from(
    { length: Math.min(maxConcurrentRequests, names.length) },
    async () => {
      while (names.length > 0) {
        const packageName = names.pop();
        timeMaps.set(packageName, await fetchPackageTimes(packageName));
      }
    },
  );
  await Promise.all(workers);
  return timeMaps;
}

function classifyPackages(resolvedPackages, { cutoff, exclusions, timeMaps }) {
  const missingVersions = [];
  const tooNew = [];
  const excludedTooNew = [];

  for (const { packageName, version } of resolvedPackages) {
    const publishedAtRaw = timeMaps.get(packageName)[version];
    if (typeof publishedAtRaw !== "string") {
      missingVersions.push(`${packageName}@${version}`);
      continue;
    }
    const publishedAt = new Date(publishedAtRaw);
    if (Number.isNaN(publishedAt.valueOf())) {
      missingVersions.push(`${packageName}@${version}`);
      continue;
    }
    if (publishedAt <= cutoff) {
      continue;
    }
    const finding = `${packageName}@${version} published ${publishedAt.toISOString()}`;
    if (exclusions.has(`${packageName}@${version}`)) {
      excludedTooNew.push(finding);
    } else {
      tooNew.push(finding);
    }
  }

  return { missingVersions, tooNew, excludedTooNew };
}

function reportFailureList(headline, findings) {
  if (findings.length === 0) {
    return false;
  }
  console.error(headline);
  for (const finding of findings.toSorted()) {
    console.error(`- ${finding}`);
  }
  return true;
}

const days = readPolicyDays();
const lockfileText = readFileSync(lockfilePath, "utf8");
const resolvedPackages = [];
const unsupportedKeys = [];
for (const rawKey of loadPackageKeys(lockfileText)) {
  const parsed = parseRegistryPackage(rawKey);
  if (parsed === null) {
    unsupportedKeys.push(rawKey);
  } else {
    resolvedPackages.push(parsed);
  }
}

if (
  reportFailureList("Release-age policy failed: unsupported lockfile entries.", unsupportedKeys)
) {
  process.exit(1);
}

const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const timeMaps = await loadTimeMaps(new Set(resolvedPackages.map((entry) => entry.packageName)));
const { missingVersions, tooNew, excludedTooNew } = classifyPackages(resolvedPackages, {
  cutoff,
  exclusions: readExclusions(),
  timeMaps,
});

if (
  reportFailureList(
    "Release-age policy failed: registry metadata is missing locked version(s).",
    missingVersions,
  )
) {
  process.exit(1);
}
if (excludedTooNew.length > 0) {
  console.log(`Release-age policy applied ${excludedTooNew.length} exact-version exclusion(s).`);
}
if (reportFailureList(`Release-age policy failed: package(s) newer than ${days} day(s).`, tooNew)) {
  process.exit(1);
}

console.log(
  `Release-age policy passed: ${resolvedPackages.length} locked version(s), minimum age ${days} day(s).`,
);
