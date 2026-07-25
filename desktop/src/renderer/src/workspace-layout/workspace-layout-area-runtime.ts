import type { WorkspaceSceneMode } from "./runtime-mode-options";
import type { SurfaceKind } from "./types";

export interface WorkspaceSurfaceFocusRequest {
  requestId: number;
  surfaceKind: SurfaceKind;
}

export function workspaceBenchmarkShouldRun(mode: WorkspaceSceneMode): boolean {
  return mode === "benchmark" && workspaceAutoBenchmarkEnabled();
}

export function workspaceSceneMode(): WorkspaceSceneMode {
  if (typeof window === "undefined") {
    return "workspace";
  }
  return new URLSearchParams(window.location?.search ?? "").get("workspaceScene") === "benchmark"
    ? "benchmark"
    : "workspace";
}

export function workspaceRuntimeIdentity(workspace: { displayName: string; id: string } | null): {
  workspaceId: string;
  workspaceName: string;
} {
  if (!workspace) {
    return { workspaceId: "empty", workspaceName: "No workspace" };
  }
  return { workspaceId: workspace.id, workspaceName: workspace.displayName };
}

function workspaceAutoBenchmarkEnabled(): boolean {
  return new URLSearchParams(window.location?.search ?? "").get("workspaceAuto") !== "false";
}
