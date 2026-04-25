import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, "..");
const targetScope = "app-subsystem";

const args = process.argv.slice(2);
const [sourceSidecarPathArg, outputSidecarPathArg] = args;

if (args.length !== 2 || !sourceSidecarPathArg || !outputSidecarPathArg) {
  console.error(
    "Usage: node prune_app_subsystem_sdk_non_http_sidecar.mjs <source-sidecar> <output-sidecar>",
  );
  process.exit(1);
}

const sourceSidecarPath = resolve(frontendRoot, sourceSidecarPathArg);
const outputSidecarPath = resolve(frontendRoot, outputSidecarPathArg);

function contractHasTargetScope(entry) {
  return (
    entry?.kind === "enum" &&
    Array.isArray(entry.frontendSDKScopes) &&
    entry.frontendSDKScopes.includes(targetScope)
  );
}

function exportedValueTargetScope(entry) {
  if (!entry || !Array.isArray(entry.frontendSDKScopes)) {
    return null;
  }
  return (
    entry.frontendSDKScopes.find((scope) => scope?.scope === targetScope) ??
    null
  );
}

function emptyValueLike(value) {
  if (Array.isArray(value)) {
    return [];
  }
  if (value !== null && typeof value === "object") {
    return {};
  }
  return null;
}

function cloneJSONValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function valueAtPath(value, path) {
  let current = value;
  for (const segment of path) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, segment)
    ) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }
  return { found: true, value: cloneJSONValue(current) };
}

function assignPath(target, path, value) {
  let current = target;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    if (index === path.length - 1) {
      current[segment] = value;
      return;
    }
    const nextSegment = path[index + 1];
    if (!Object.hasOwn(current, segment)) {
      current[segment] = /^\d+$/.test(nextSegment) ? [] : {};
    }
    current = current[segment];
  }
}

function pruneValuePaths(value, valuePaths) {
  const pruned = emptyValueLike(value);
  if (!Array.isArray(valuePaths) || valuePaths.length === 0) {
    return pruned;
  }
  if (pruned === null || typeof pruned !== "object") {
    throw new Error("Cannot prune value paths from a non-object exported value.");
  }

  for (const rawPath of valuePaths) {
    if (!Array.isArray(rawPath) || rawPath.length === 0) {
      throw new Error("SDK exported value path must be a non-empty array.");
    }
    const path = rawPath.map((segment) => String(segment));
    const resolved = valueAtPath(value, path);
    if (!resolved.found) {
      throw new Error(
        `Missing SDK exported value path ${path.join(".")} in ${relative(process.cwd(), sourceSidecarPath)}.`,
      );
    }
    assignPath(pruned, path, resolved.value);
  }

  return pruned;
}

function pruneExportedValue(entry, scope) {
  if (scope.includeFullValue) {
    return {
      ...entry,
      frontendSDKScopes: [scope],
    };
  }
  return {
    ...entry,
    frontendSDKScopes: [scope],
    value: pruneValuePaths(entry.value, scope.valuePaths ?? []),
  };
}

const sidecar = JSON.parse(readFileSync(sourceSidecarPath, "utf8"));

const contracts = (sidecar.contracts ?? []).filter(contractHasTargetScope);
const exportedValues = (sidecar.exportedValues ?? [])
  .map((entry) => {
    const scope = exportedValueTargetScope(entry);
    if (!scope) {
      return null;
    }
    return pruneExportedValue(entry, scope);
  })
  .filter(Boolean);

writeFileSync(
  outputSidecarPath,
  `${JSON.stringify(
    {
      schemaVersion: sidecar.schemaVersion,
      contracts,
      exportedValues,
    },
    null,
    2,
  )}\n`,
);
