import { Buffer } from "node:buffer";
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";

export const liveOpenAIArtifactPrivacyViolationCode =
  "SETTA_LIVE_OPENAI_ARTIFACT_PRIVACY_VIOLATION";

export async function finalizeLiveOpenAIArtifacts({
  artifactDir,
  description = "live OpenAI private speech credential",
  finalizers = [],
  markers,
  workflowError = null,
}) {
  assertValidMarkers(markers);
  const preservedError = await runFinalizers(finalizers, workflowError);
  const scan = await scanArtifactsForMarkers(artifactDir, markers);
  if (scan.leakedFileCount > 0) {
    await rm(artifactDir, { force: true, recursive: true });
    throw artifactPrivacyViolationError({
      description,
      leakedFileCount: scan.leakedFileCount,
      markers,
      workflowError: preservedError,
    });
  }
  if (preservedError) {
    throw redactLiveOpenAIError(preservedError, markers);
  }
  return scan;
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

function artifactPrivacyViolationError({ description, leakedFileCount, markers, workflowError }) {
  const originalFailure = workflowError
    ? ` Original workflow failure: ${redactMarkers(errorMessage(workflowError), markers)}`
    : "";
  const plural = leakedFileCount === 1 ? "file" : "files";
  const error = new Error(
    `${description} appeared in ${leakedFileCount} finalized artifact ${plural}; contaminated artifacts were removed.${originalFailure}`,
  );
  error.code = liveOpenAIArtifactPrivacyViolationCode;
  error.originalWorkflowFailure = workflowError
    ? redactMarkers(errorMessage(workflowError), markers)
    : null;
  return error;
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
