import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, "..");

const [sourceSidecarPathArg, outputSidecarPathArg, ...sdkReaderPathArgs] =
  process.argv.slice(2);

if (
  !sourceSidecarPathArg ||
  !outputSidecarPathArg ||
  sdkReaderPathArgs.length === 0
) {
  console.error(
    "Usage: node prune_app_subsystem_sdk_non_http_sidecar.mjs <source-sidecar> <output-sidecar> <sdk-reader-source>...",
  );
  process.exit(1);
}

const sourceSidecarPath = resolve(frontendRoot, sourceSidecarPathArg);
const outputSidecarPath = resolve(frontendRoot, outputSidecarPathArg);
const sdkReaderPaths = sdkReaderPathArgs.map((pathArg) =>
  resolve(frontendRoot, pathArg),
);

function skipWhitespace(source, index) {
  let nextIndex = index;
  while (nextIndex < source.length && /\s/.test(source[nextIndex] ?? "")) {
    nextIndex += 1;
  }
  return nextIndex;
}

function skipTypeArguments(source, index) {
  let nextIndex = skipWhitespace(source, index);
  if (source[nextIndex] !== "<") {
    return nextIndex;
  }

  let depth = 0;
  while (nextIndex < source.length) {
    const char = source[nextIndex];
    if (char === "<") {
      depth += 1;
    } else if (char === ">") {
      depth -= 1;
      if (depth === 0) {
        return skipWhitespace(source, nextIndex + 1);
      }
    }
    nextIndex += 1;
  }
  throw new Error("Unterminated generated sidecar reader type arguments.");
}

function collectReadNames(source, readerName) {
  const names = new Set();
  let searchIndex = 0;
  while (searchIndex < source.length) {
    const callIndex = source.indexOf(readerName, searchIndex);
    if (callIndex === -1) {
      break;
    }
    const openParenIndex = skipTypeArguments(
      source,
      callIndex + readerName.length,
    );
    if (source[openParenIndex] !== "(") {
      searchIndex = callIndex + readerName.length;
      continue;
    }
    const firstArgIndex = skipWhitespace(source, openParenIndex + 1);
    const quote = source[firstArgIndex];
    if (quote !== '"' && quote !== "'") {
      searchIndex = callIndex + readerName.length;
      continue;
    }
    const closeQuoteIndex = source.indexOf(quote, firstArgIndex + 1);
    if (closeQuoteIndex === -1) {
      throw new Error(
        `${readerName} string literal is unterminated near offset ${callIndex}.`,
      );
    }
    names.add(source.slice(firstArgIndex + 1, closeQuoteIndex));
    searchIndex = closeQuoteIndex + 1;
  }
  return names;
}

function collectSDKSidecarReads() {
  const enumNames = new Set();
  const exportedValueNames = new Set();

  for (const filePath of sdkReaderPaths) {
    const source = readFileSync(filePath, "utf8");
    for (const name of collectReadNames(source, "readGeneratedStringEnum")) {
      enumNames.add(name);
    }
    for (const name of collectReadNames(source, "readGeneratedExportedValue")) {
      exportedValueNames.add(name);
    }
  }

  return { enumNames, exportedValueNames };
}

function assertAllFound(kind, expectedNames, foundNames) {
  const missing = [...expectedNames].filter((name) => !foundNames.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Missing ${kind} in ${relative(process.cwd(), sourceSidecarPath)}: ${missing.join(", ")}`,
    );
  }
}

function pickValueKeys(value, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]]),
  );
}

function narrowExportedValue(entry) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }
  if (entry.name === "BootstrapProtocol") {
    return {
      ...entry,
      value: pickValueKeys(entry.value ?? {}, ["launcherOriginStorageKey"]),
    };
  }
  if (entry.name === "EndpointOriginPolicyByRoute") {
    return {
      ...entry,
      value: pickValueKeys(entry.value ?? {}, ["/__setta__/tools/call"]),
    };
  }
  if (entry.name === "ModeScopedLauncherRoutesList") {
    return {
      ...entry,
      value: [],
    };
  }
  if (entry.name === "TransportRouteConstants") {
    return {
      ...entry,
      value: {
        apiPrefix: entry.value?.apiPrefix,
        binary: pickValueKeys(entry.value?.binary ?? {}, [
          "download",
          "upload",
        ]),
        root: pickValueKeys(entry.value?.root ?? {}, [
          "bootstrapPage",
          "toolsCall",
        ]),
        websocket: pickValueKeys(entry.value?.websocket ?? {}, [
          "frontend",
          "listenerById",
          "terminalBySection",
        ]),
      },
    };
  }
  return entry;
}

const sidecar = JSON.parse(readFileSync(sourceSidecarPath, "utf8"));
const { enumNames, exportedValueNames } = collectSDKSidecarReads();

const contracts = (sidecar.contracts ?? []).filter((entry) => {
  return entry?.kind === "enum" && enumNames.has(entry.name);
});
const exportedValues = (sidecar.exportedValues ?? [])
  .filter((entry) => {
    return exportedValueNames.has(entry?.name);
  })
  .map(narrowExportedValue);

assertAllFound(
  "enum contracts",
  enumNames,
  new Set(contracts.map((entry) => entry.name)),
);
assertAllFound(
  "exported values",
  exportedValueNames,
  new Set(exportedValues.map((entry) => entry.name)),
);

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
