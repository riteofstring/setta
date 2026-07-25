import type { WorkspaceSceneMode } from "./runtime-mode-options";

export const emptyWorkspaceRuntimeId = "empty";

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

export function workspaceRuntimeIdentity(
  workspace: { displayName: string; id: string; rootPath: string } | null,
): {
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string | null;
} {
  if (!workspace) {
    return {
      workspaceId: emptyWorkspaceRuntimeId,
      workspaceName: "No workspace",
      workspaceRootPath: null,
    };
  }
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.displayName,
    workspaceRootPath: workspace.rootPath,
  };
}

function workspaceAutoBenchmarkEnabled(): boolean {
  return new URLSearchParams(window.location?.search ?? "").get("workspaceAuto") !== "false";
}
