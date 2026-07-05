import type { WorkspaceUILayout } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkspaceSceneMode } from "./runtime-mode-options";
import { workspaceUILayoutFromScene } from "./workspace-scene";
import type { WorkspaceRuntime } from "./workspace-runtime";

export type WorkspaceUILayoutLoad =
  | {
      error: null;
      key: string;
      layout: WorkspaceUILayout | null;
      status: "loaded";
    }
  | {
      error: string;
      key: string;
      layout: null;
      status: "failed";
    }
  | {
      error: null;
      key: string;
      layout: null;
      status: "loading";
    };

export function WorkspaceLayoutLoading({
  mode,
  platform,
  workspaceId,
}: {
  mode: WorkspaceSceneMode;
  platform: DesktopPlatform;
  workspaceId: string;
}) {
  return (
    <section
      aria-label={workspaceLayoutAreaLabel(mode)}
      className="workspace-layout-area relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-browser-pane-count="0"
      data-desktop-platform={platform}
      data-maximized-pane-id=""
      data-pane-count="0"
      data-presentation-mode="normal"
      data-workspace-mode={mode}
      data-workspace-id={workspaceId}
      data-testid="workspace-layout-area"
    />
  );
}

export function useWorkspaceUILayoutLoad(
  workspaceId: string,
  mode: WorkspaceSceneMode,
): WorkspaceUILayoutLoad {
  const key = `${mode}:${workspaceId}`;
  const [state, setState] = useState<WorkspaceUILayoutLoad>(() =>
    initialWorkspaceUILayoutLoadState(workspaceId, mode),
  );
  const shouldLoad = shouldLoadWorkspaceUILayout(workspaceId, mode);

  useEffect(() => {
    if (!shouldLoad) {
      setState({
        error: null,
        key,
        layout: null,
        status: "loaded",
      });
      return;
    }

    let cancelled = false;
    setState({
      error: null,
      key,
      layout: null,
      status: "loading",
    });
    window.setta.workspace
      .readUILayout(workspaceId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setState({
          error: null,
          key,
          layout: result.layout,
          status: "loaded",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          error: `Workspace UI state could not be loaded: ${layoutOperationErrorMessage(error)}`,
          key,
          layout: null,
          status: "failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [key, shouldLoad, workspaceId]);

  if (!shouldLoad) {
    return {
      error: null,
      key,
      layout: null,
      status: "loaded",
    };
  }
  if (state.key !== key) {
    return {
      error: null,
      key,
      layout: null,
      status: "loading",
    };
  }
  return state;
}

export function initialWorkspaceUILayoutLoadState(
  workspaceId: string,
  mode: WorkspaceSceneMode,
): WorkspaceUILayoutLoad {
  const key = `${mode}:${workspaceId}`;
  if (shouldLoadWorkspaceUILayout(workspaceId, mode)) {
    return {
      error: null,
      key,
      layout: null,
      status: "loading",
    };
  }
  return {
    error: null,
    key,
    layout: null,
    status: "loaded",
  };
}

export function useWorkspaceUILayoutPersistence(runtime: WorkspaceRuntime, workspaceId: string) {
  const pendingLayoutSaveRef = useRef<Promise<unknown>>(Promise.resolve());
  const [layoutPersistenceError, setLayoutPersistenceError] = useState<string | null>(null);

  const persistLayout = useCallback(() => {
    runtime.presentation.syncPanes(runtime.store.toScene().panes);
    if (runtime.mode !== "workspace") {
      return;
    }
    const layout = workspaceUILayoutFromScene(
      workspaceId,
      runtime.store.toScene(),
      runtime.store.focusedPaneId(),
    );
    pendingLayoutSaveRef.current = pendingLayoutSaveRef.current
      .catch(() => {})
      .then(() => window.setta.workspace.saveUILayout(layout))
      .then(() => {
        setLayoutPersistenceError(null);
      })
      .catch((error: unknown) => {
        setLayoutPersistenceError(layoutOperationErrorMessage(error));
      });
  }, [runtime, workspaceId]);
  const resetLayoutPersistenceError = useCallback(() => {
    setLayoutPersistenceError(null);
  }, []);

  return { layoutPersistenceError, persistLayout, resetLayoutPersistenceError };
}

export function workspaceLayoutRecoveryMessage({
  dismissed,
  layoutLoadError,
  layoutPersistenceError,
  runtime,
}: {
  dismissed: boolean;
  layoutLoadError: string | null;
  layoutPersistenceError: string | null;
  runtime: WorkspaceRuntime;
}): string | null {
  if (dismissed) {
    return null;
  }
  return layoutLoadError ?? layoutPersistenceError ?? runtime.layoutRecovery?.message ?? null;
}

export function workspaceLayoutAreaLabel(mode: WorkspaceSceneMode): string {
  return mode === "benchmark" ? "Workspace benchmark workspace" : "Workspace workspace";
}

function shouldLoadWorkspaceUILayout(workspaceId: string, mode: WorkspaceSceneMode): boolean {
  return (
    mode === "workspace" &&
    workspaceId !== "empty" &&
    typeof window !== "undefined" &&
    Boolean(window.setta?.workspace?.readUILayout)
  );
}

function layoutOperationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workspace layout operation failed";
}
