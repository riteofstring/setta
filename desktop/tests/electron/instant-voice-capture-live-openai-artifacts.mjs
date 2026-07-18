import { Buffer } from "node:buffer";
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";

export const liveOpenAIArtifactPrivacyViolationCode =
  "SETTA_LIVE_OPENAI_ARTIFACT_PRIVACY_VIOLATION";

export async function finalizeLiveOpenAIArtifacts({
  artifactDir,
  cleanupFinalizers = [],
  description = "live OpenAI private speech credential",
  finalizers = [],
  markers,
  scanRoots = [],
  workflowError = null,
}) {
  assertValidMarkers(markers);
  const preservedError = await runFinalizers(finalizers, workflowError);
  const roots = finalizedScanRoots({ artifactDir, markers, scanRoots });
  let finalError = preservedError;
  const scan = await scanRootsOrCleanup({
    cleanupFinalizers,
    initialError: finalError,
    roots,
  });
  if (scan.leakedFileCount > 0) {
    await rm(artifactDir, { force: true, recursive: true });
    finalError = await runFinalizers(cleanupFinalizers, finalError);
    throw artifactPrivacyViolationError({
      description,
      leakedFileCount: scan.leakedFileCount,
      markers,
      scannedRootCount: scan.scannedRootCount,
      workflowError: finalError,
    });
  }
  finalError = await runFinalizers(cleanupFinalizers, finalError);
  if (finalError) {
    throw redactLiveOpenAIError(finalError, allRootMarkers(roots));
  }
  return scan;
}

async function scanRootsOrCleanup({ cleanupFinalizers, initialError, roots }) {
  try {
    return await scanArtifactRootsForMarkers(roots);
  } catch (error) {
    const finalError = await runFinalizers(cleanupFinalizers, initialError ?? error);
    throw redactLiveOpenAIError(finalError, allRootMarkers(roots));
  }
}

export function redactLiveOpenAIError(error, markers) {
  assertValidMarkers(markers);
  if (!(error instanceof Error)) {
    return new Error(redactMarkers(errorMessage(error), markers));
  }
  return redactErrorObject(error, markers);
}

function redactErrorObject(error, markers) {
  const message = errorMessage(error);
  const stack = errorStack(error);
  const redactedMessage = redactMarkers(message, markers);
  const redactedStack = redactOptionalStack(stack, markers);
  if (redactedMessage === message && redactedStack === stack) {
    return error;
  }
  const redactedError = new Error(redactedMessage);
  redactedError.name = error.name;
  if (redactedStack !== "") {
    redactedError.stack = redactedStack;
  }
  if ("code" in error) {
    redactedError.code = error.code;
  }
  return redactedError;
}

function errorStack(error) {
  return typeof error.stack === "string" ? error.stack : "";
}

function redactOptionalStack(stack, markers) {
  return stack === "" ? "" : redactMarkers(stack, markers);
}

export async function scanArtifactsForMarkers(root, markers) {
  assertValidMarkers(markers);
  const markerBuffers = markers.map((marker) => Buffer.from(marker));
  const leakedRelativePaths = [];
  let scannedFileCount = 0;
  for (const path of await artifactFilePaths(root)) {
    scannedFileCount += 1;
    const content = await readFile(path);
    if (markerBuffers.some((marker) => content.includes(marker))) {
      leakedRelativePaths.push(relative(root, path));
    }
  }
  return {
    leakedFileCount: leakedRelativePaths.length,
    leakedRelativePaths,
    scannedFileCount,
  };
}

async function scanArtifactRootsForMarkers(roots) {
  const leakedRelativePaths = [];
  let scannedFileCount = 0;
  for (const scanRoot of roots) {
    const scan = await scanArtifactsForMarkers(scanRoot.root, scanRoot.markers);
    scannedFileCount += scan.scannedFileCount;
    leakedRelativePaths.push(
      ...scan.leakedRelativePaths.map((path) => `${scanRoot.description}/${path}`),
    );
  }
  return {
    leakedFileCount: leakedRelativePaths.length,
    leakedRelativePaths,
    scannedFileCount,
    scannedRootCount: roots.length,
  };
}

async function runFinalizers(finalizers, workflowError) {
  let preservedError = workflowError;
  for (const finalizer of finalizers) {
    try {
      await finalizer();
    } catch (error) {
      if (!preservedError) {
        preservedError = error;
      }
    }
  }
  return preservedError;
}

function artifactPrivacyViolationError({
  description,
  leakedFileCount,
  markers,
  scannedRootCount,
  workflowError,
}) {
  const originalFailure = workflowError
    ? ` Original workflow failure: ${redactMarkers(errorMessage(workflowError), markers)}`
    : "";
  const plural = leakedFileCount === 1 ? "file" : "files";
  const scope =
    scannedRootCount === 1 ? "finalized artifact" : "finalized artifact or temporary-state";
  const error = new Error(
    `${description} appeared in ${leakedFileCount} ${scope} ${plural}; contaminated artifacts were removed.${originalFailure}`,
  );
  error.code = liveOpenAIArtifactPrivacyViolationCode;
  error.originalWorkflowFailure = workflowError
    ? redactMarkers(errorMessage(workflowError), markers)
    : null;
  return error;
}

function finalizedScanRoots({ artifactDir, markers, scanRoots }) {
  const roots = [
    {
      description: "artifacts",
      markers,
      root: artifactDir,
    },
  ];
  for (const scanRoot of scanRoots) {
    roots.push(normalizedScanRoot(scanRoot, markers));
  }
  return roots;
}

function normalizedScanRoot(scanRoot, defaultMarkers) {
  if (typeof scanRoot === "string") {
    return {
      description: "temporary-state",
      markers: defaultMarkers,
      root: scanRoot,
    };
  }
  if (!scanRoot || typeof scanRoot !== "object") {
    throw new Error("artifact privacy scan root must be a path or object");
  }
  const root = scanRoot.root;
  if (typeof root !== "string" || root === "") {
    throw new Error("artifact privacy scan root requires a non-empty root");
  }
  const rootMarkers = scanRoot.markers ?? defaultMarkers;
  assertValidMarkers(rootMarkers);
  return {
    description:
      typeof scanRoot.description === "string" && scanRoot.description !== ""
        ? scanRoot.description
        : "temporary-state",
    markers: rootMarkers,
    root,
  };
}

function allRootMarkers(roots) {
  return [...new Set(roots.flatMap((root) => root.markers))];
}

function redactMarkers(value, markers) {
  return markers.reduce(
    (redacted, marker) => redacted.split(marker).join("[REDACTED_SECRET]"),
    value,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertValidMarkers(markers) {
  if (
    !Array.isArray(markers) ||
    markers.length === 0 ||
    markers.some((marker) => typeof marker !== "string" || marker === "")
  ) {
    throw new Error("artifact privacy finalization requires non-empty string markers");
  }
}

async function artifactFilePaths(root) {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await artifactFilePaths(path)));
    } else if (entry.isFile()) {
      paths.push(path);
    }
  }
  return paths;
}
