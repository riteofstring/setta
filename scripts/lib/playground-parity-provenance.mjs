import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, run } from "./process.mjs";

export const CAPTURE_SCHEMA_VERSION = 1;
const GOVERNED_PRODUCT_SOURCE_PATHS = [
  "examples/workspace-playground/src",
  "packages/workspace/src",
];
const PERMITTED_UNREACHABLE_SOURCE_PATHS = new Set([
  "packages/workspace/src/canvas/xyflow/WorkspaceXyflowAdapter.test.tsx",
  "packages/workspace/src/canvas/xyflow/WorkspaceXyflowAdapter.tsx",
  "packages/workspace/src/canvas/xyflow/WorkspaceXyflowNode.tsx",
  "packages/workspace/src/canvas/xyflow/types.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowProjection.test.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowProjection.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowRuntime.test.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowRuntime.ts",
]);
const WORKSPACE_DIST_DIRECTORY = path.join(
  repositoryRoot,
  "packages/workspace/dist",
);

function responseReceipt(response, bytes) {
  return {
    bytes: bytes.length,
    contentType: response.headers.get("content-type"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    status: response.status,
    url: response.url,
  };
}

async function readLiveResponse(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `${label} request failed with HTTP ${String(response.status)}.`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, receipt: responseReceipt(response, bytes) };
}

export async function livePlaygroundResponseHashes(url) {
  const documentResponse = await readLiveResponse(url, "Live Playground");
  const documentHtml = documentResponse.bytes.toString("utf8");
  const scriptSources = [
    ...documentHtml.matchAll(
      /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/giu,
    ),
  ].map((match) => match[1]);
  const entrySource =
    scriptSources.find((source) =>
      new URL(source, documentResponse.receipt.url).pathname.startsWith(
        "/src/",
      ),
    ) ?? scriptSources.at(-1);
  if (!entrySource) {
    throw new Error(
      "Live Playground document has no JavaScript entry response.",
    );
  }
  const stylesheetUrl = new URL("/src/index.css", documentResponse.receipt.url)
    .href;
  const [javascriptResponse, stylesheetResponse] = await Promise.all([
    readLiveResponse(
      new URL(entrySource, documentResponse.receipt.url).href,
      "Live Playground JavaScript",
    ),
    readLiveResponse(stylesheetUrl, "Live Playground stylesheet"),
  ]);
  return {
    document: documentResponse.receipt,
    javascript: javascriptResponse.receipt,
    stylesheet: stylesheetResponse.receipt,
  };
}

export function resolveCommit(revision) {
  return run("git", ["rev-parse", "--verify", `${revision}^{commit}`], {
    capture: true,
  }).stdout.trim();
}

export function currentCommit() {
  return resolveCommit("HEAD");
}

export function workspaceDistArtifactHashes() {
  if (!existsSync(WORKSPACE_DIST_DIRECTORY)) {
    throw new Error(
      `The built workspace artifact is missing: ${WORKSPACE_DIST_DIRECTORY}.`,
    );
  }
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  };
  visit(WORKSPACE_DIST_DIRECTORY);
  if (files.length === 0) {
    throw new Error(
      `The built workspace artifact has no files: ${WORKSPACE_DIST_DIRECTORY}.`,
    );
  }
  return {
    directory: path.relative(repositoryRoot, WORKSPACE_DIST_DIRECTORY),
    files: files.sort().map((filePath) => ({
      path: path.relative(repositoryRoot, filePath),
      sha256: createHash("sha256").update(readFileSync(filePath)).digest("hex"),
    })),
  };
}

export function sameArtifactHashes(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertRealManifestFile(manifestPath) {
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Runtime reference manifest does not exist: ${manifestPath}.`,
    );
  }
  const status = lstatSync(manifestPath);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(
      `Runtime reference manifest must be a real file: ${manifestPath}.`,
    );
  }
}

function parseRuntimeReferenceManifest(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Runtime reference manifest is not readable JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertBaselineRuntimeManifest(manifest) {
  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== CAPTURE_SCHEMA_VERSION ||
    !isRecord(manifest.capture) ||
    manifest.capture.mode !== "baseline"
  ) {
    throw new Error(
      "Runtime reference manifest must be a baseline capture with the supported schema.",
    );
  }
}

function assertReferenceCommit(capture, referenceCommit) {
  if (capture.frozenReferenceCommit !== referenceCommit) {
    throw new Error(
      `Runtime reference manifest frozen reference ${String(capture.frozenReferenceCommit)} does not match ${referenceCommit}.`,
    );
  }
}

function assertCaptureMetadata(capture) {
  if (
    !isRecord(capture.chrome) ||
    !isRecord(capture.builtWorkspace) ||
    !isRecord(capture.liveResponses)
  ) {
    throw new Error(
      "Runtime reference manifest lacks Chrome, workspace artifact, or live response metadata.",
    );
  }
}

function assertLiveResponseMetadata(response, responseName) {
  if (!isRecord(response) || !/^[0-9a-f]{64}$/.test(response.sha256)) {
    throw new Error(
      `Runtime reference manifest has invalid ${responseName} response metadata.`,
    );
  }
}

export function readRuntimeReferenceManifest(manifestPath, referenceCommit) {
  assertRealManifestFile(manifestPath);
  const manifest = parseRuntimeReferenceManifest(manifestPath);
  assertBaselineRuntimeManifest(manifest);
  const capture = manifest.capture;
  assertReferenceCommit(capture, referenceCommit);
  assertCaptureMetadata(capture);
  for (const responseName of ["document", "javascript", "stylesheet"]) {
    assertLiveResponseMetadata(
      capture.liveResponses[responseName],
      responseName,
    );
  }
  return {
    capture,
    manifestPath,
    manifestSha256: createHash("sha256")
      .update(readFileSync(manifestPath))
      .digest("hex"),
  };
}

function sameLiveResponseHashes(left, right) {
  return ["document", "javascript", "stylesheet"].every(
    (responseName) =>
      left?.[responseName]?.sha256 === right?.[responseName]?.sha256,
  );
}

export function assertRuntimeReferenceArtifact(
  reference,
  builtWorkspace,
  liveResponses,
) {
  if (!sameArtifactHashes(reference.capture.builtWorkspace, builtWorkspace)) {
    throw new Error(
      "The built workspace artifact does not exactly match the runtime reference manifest.",
    );
  }
  if (!sameLiveResponseHashes(reference.capture.liveResponses, liveResponses)) {
    throw new Error(
      "Live Playground document, JavaScript, or stylesheet hashes do not match the runtime reference manifest.",
    );
  }
}

export function runtimeReferenceReceipt(reference, referenceCommit, chrome) {
  if (!sameValue(reference.capture.chrome, chrome)) {
    throw new Error(
      "Chrome identity does not exactly match the runtime reference manifest.",
    );
  }
  return {
    acceptedBaseline: {
      captureCommit: reference.capture.captureCommit,
      frozenReferenceCommit: reference.capture.frozenReferenceCommit,
      manifestPath: path.relative(repositoryRoot, reference.manifestPath),
      manifestSha256: reference.manifestSha256,
    },
    currentSourceDiffPaths: governedProductSourceChanges(referenceCommit),
    verification: {
      builtWorkspace: true,
      chrome: true,
      liveResponseHashes: true,
    },
  };
}

function governedProductSourceChanges(referenceCommit) {
  const changed = run(
    "git",
    [
      "diff",
      "--name-only",
      referenceCommit,
      "--",
      ...GOVERNED_PRODUCT_SOURCE_PATHS,
    ],
    { capture: true },
  )
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  const untracked = run(
    "git",
    [
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      ...GOVERNED_PRODUCT_SOURCE_PATHS,
    ],
    { capture: true },
  )
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  return [...new Set([...changed, ...untracked])].sort();
}

function isTestSourcePath(filePath) {
  return /\.test\.[cm]?[jt]sx?$/u.test(filePath);
}

function baselineSourceGuard(referenceCommit) {
  const ignoredTestDiffPaths = [];
  const permittedUnreachableDiffPaths = [];
  const rejectedProductSourceDiffPaths = [];
  for (const filePath of governedProductSourceChanges(referenceCommit)) {
    if (PERMITTED_UNREACHABLE_SOURCE_PATHS.has(filePath)) {
      permittedUnreachableDiffPaths.push(filePath);
    } else if (isTestSourcePath(filePath)) {
      ignoredTestDiffPaths.push(filePath);
    } else {
      rejectedProductSourceDiffPaths.push(filePath);
    }
  }
  return {
    ignoredTestDiffPaths,
    permittedUnreachableDiffPaths,
    rejectedProductSourceDiffPaths,
  };
}

export function assertBaselineProductSource(referenceCommit) {
  const sourceGuard = baselineSourceGuard(referenceCommit);
  if (sourceGuard.rejectedProductSourceDiffPaths.length > 0) {
    throw new Error(
      `Baseline capture requires mounted product source to match ${referenceCommit}. Differences:\n${sourceGuard.rejectedProductSourceDiffPaths.join("\n")}`,
    );
  }
  return sourceGuard;
}
