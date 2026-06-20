import type { MutableRefObject } from "react";

import type { WorkflowGraphCameraState } from "./pixi-renderer";

export type SyntheticWorkflowGraphOptions = { edgesPerNode: number; nodeCount: number } | null;

export type WorkflowGraphCameraScope =
  | {
      kind: "synthetic";
      edgesPerNode: number;
      nodeCount: number;
    }
  | {
      kind: "workspace";
      workspaceId: string;
    };

interface StoredWorkflowGraphCameraState {
  camera: WorkflowGraphCameraState;
  scope: WorkflowGraphCameraScope | null;
}

const workflowGraphCameraStates = new Map<string, StoredWorkflowGraphCameraState>();

function workflowGraphCameraScope(
  syntheticGraph: SyntheticWorkflowGraphOptions,
  workflowWorkspaceId: string,
): WorkflowGraphCameraScope | null {
  if (syntheticGraph !== null) {
    return {
      edgesPerNode: syntheticGraph.edgesPerNode,
      kind: "synthetic",
      nodeCount: syntheticGraph.nodeCount,
    };
  }
  if (workflowWorkspaceId === "") {
    return null;
  }
  return {
    kind: "workspace",
    workspaceId: workflowWorkspaceId,
  };
}

export function syncWorkflowGraphCameraScope({
  cameraRef,
  scopeRef,
  surfaceId,
  syntheticGraph,
  workflowWorkspaceId,
}: {
  cameraRef: MutableRefObject<WorkflowGraphCameraState | null>;
  scopeRef: MutableRefObject<WorkflowGraphCameraScope | null>;
  surfaceId: string;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  workflowWorkspaceId: string;
}): void {
  const nextScope = workflowGraphCameraScope(syntheticGraph, workflowWorkspaceId);
  if (nextScope === null) {
    return;
  }
  const previousScope = scopeRef.current;
  scopeRef.current = nextScope;
  if (previousScope !== null && workflowGraphCameraScopeChanged(previousScope, nextScope)) {
    cameraRef.current = null;
    clearWorkflowGraphCameraState(surfaceId);
    return;
  }
  const storedCamera = readWorkflowGraphCameraState(surfaceId, nextScope);
  if (storedCamera !== null) {
    cameraRef.current = storedCamera;
  }
}

function clearWorkflowGraphCameraState(surfaceId: string): void {
  workflowGraphCameraStates.delete(surfaceId);
}

function readWorkflowGraphCameraState(
  surfaceId: string,
  scope: WorkflowGraphCameraScope | null,
): WorkflowGraphCameraState | null {
  const stored = workflowGraphCameraStates.get(surfaceId);
  if (!stored || !workflowGraphCameraScopesCompatible(stored.scope, scope)) {
    return null;
  }
  return { ...stored.camera };
}

export function writeWorkflowGraphCameraState(
  surfaceId: string,
  scope: WorkflowGraphCameraScope | null,
  camera: WorkflowGraphCameraState,
): void {
  workflowGraphCameraStates.set(surfaceId, {
    camera: { ...camera },
    scope,
  });
}

function workflowGraphCameraScopeChanged(
  previous: WorkflowGraphCameraScope,
  next: WorkflowGraphCameraScope,
): boolean {
  if (previous.kind !== next.kind) {
    return true;
  }
  if (previous.kind === "synthetic" && next.kind === "synthetic") {
    return previous.edgesPerNode !== next.edgesPerNode || previous.nodeCount !== next.nodeCount;
  }
  return (
    previous.kind === "workspace" &&
    next.kind === "workspace" &&
    previous.workspaceId !== next.workspaceId
  );
}

function workflowGraphCameraScopesCompatible(
  stored: WorkflowGraphCameraScope | null,
  current: WorkflowGraphCameraScope | null,
): boolean {
  if (stored === null || current === null) {
    return true;
  }
  return !workflowGraphCameraScopeChanged(stored, current);
}
