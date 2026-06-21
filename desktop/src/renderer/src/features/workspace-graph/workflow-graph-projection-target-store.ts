import type { WorkflowGraphProjection } from "@generated/backend";

export interface WorkflowGraphProjectionFocusTarget {
  definitionId: string;
  executionId: string;
  versionId: string;
  viewMode: "run" | "version";
  workspaceId: string;
}

interface StoredWorkflowGraphProjectionFocusTarget extends WorkflowGraphProjectionFocusTarget {
  schemaVersion: 1;
}

const workflowGraphProjectionTargetStoragePrefix = "setta.workflowGraph.projectionTarget.v1";

export function readWorkflowGraphProjectionFocusTarget(
  surfaceId: string,
): WorkflowGraphProjectionFocusTarget | null {
  if (surfaceId === "") {
    return null;
  }
  const raw = window.localStorage.getItem(workflowGraphProjectionTargetStorageKey(surfaceId));
  if (raw === null) {
    return null;
  }
  return decodeStoredWorkflowGraphProjectionFocusTarget(JSON.parse(raw));
}

export function writeWorkflowGraphProjectionFocusTarget(
  surfaceId: string,
  projection: WorkflowGraphProjection | null,
): void {
  if (surfaceId === "") {
    return;
  }
  const key = workflowGraphProjectionTargetStorageKey(surfaceId);
  const target = workflowGraphProjectionFocusTargetForProjection(projection);
  if (target === null) {
    window.localStorage.removeItem(key);
    return;
  }
  const stored: StoredWorkflowGraphProjectionFocusTarget = {
    ...target,
    schemaVersion: 1,
  };
  window.localStorage.setItem(key, JSON.stringify(stored));
}

export function workflowGraphProjectionFocusTargetForProjection(
  projection: WorkflowGraphProjection | null,
): WorkflowGraphProjectionFocusTarget | null {
  if (projection === null) {
    return null;
  }
  switch (projection.viewMode) {
    case "draft":
      return null;
    case "version":
      return workflowGraphVersionFocusTarget(projection);
    case "run":
      return workflowGraphRunFocusTarget(projection);
    default:
      return assertNever(projection.viewMode);
  }
}

function workflowGraphVersionFocusTarget(
  projection: WorkflowGraphProjection,
): WorkflowGraphProjectionFocusTarget | null {
  if (
    projection.workspaceId === "" ||
    projection.definitionId === "" ||
    projection.definitionVersionId === ""
  ) {
    return null;
  }
  return {
    definitionId: projection.definitionId,
    executionId: "",
    versionId: projection.definitionVersionId,
    viewMode: "version",
    workspaceId: projection.workspaceId,
  };
}

function workflowGraphRunFocusTarget(
  projection: WorkflowGraphProjection,
): WorkflowGraphProjectionFocusTarget | null {
  if (
    projection.workspaceId === "" ||
    projection.definitionId === "" ||
    projection.definitionVersionId === "" ||
    projection.executionId === ""
  ) {
    return null;
  }
  return {
    definitionId: projection.definitionId,
    executionId: projection.executionId,
    versionId: projection.definitionVersionId,
    viewMode: "run",
    workspaceId: projection.workspaceId,
  };
}

export function workflowProjectionTargetForFocusTarget(target: WorkflowGraphProjectionFocusTarget) {
  return {
    definitionId: target.definitionId,
    executionId: target.executionId,
    versionId: target.versionId,
    workspaceId: target.workspaceId,
  };
}

function workflowGraphProjectionTargetStorageKey(surfaceId: string) {
  return `${workflowGraphProjectionTargetStoragePrefix}:${surfaceId}`;
}

function decodeStoredWorkflowGraphProjectionFocusTarget(
  value: unknown,
): WorkflowGraphProjectionFocusTarget {
  if (!isRecord(value)) {
    throw new Error("Stored workflow graph projection target is not an object");
  }
  if (value.schemaVersion !== 1) {
    throw new Error(
      `Unsupported workflow graph projection target schema version: ${String(value.schemaVersion)}`,
    );
  }
  const viewMode = decodeViewMode(value.viewMode);
  const target = {
    definitionId: decodeNonEmptyString(value.definitionId, "definitionId"),
    executionId: viewMode === "run" ? decodeNonEmptyString(value.executionId, "executionId") : "",
    versionId: decodeNonEmptyString(value.versionId, "versionId"),
    viewMode,
    workspaceId: decodeNonEmptyString(value.workspaceId, "workspaceId"),
  };
  if (viewMode === "version" && value.executionId !== "") {
    throw new Error("Stored workflow graph version target must not include an execution id");
  }
  return target;
}

function decodeViewMode(value: unknown): WorkflowGraphProjectionFocusTarget["viewMode"] {
  if (value === "run" || value === "version") {
    return value;
  }
  throw new Error(`Unsupported workflow graph projection target view mode: ${String(value)}`);
}

function decodeNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`Stored workflow graph projection target ${field} is missing`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow graph projection target view mode: ${String(value)}`);
}
