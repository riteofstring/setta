import type { WorkspaceUILayout } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkspaceSceneMode } from "./runtime-mode-options";
import { WorkspaceLayoutRecoveryNotice } from "./workspace-layout-area-components";
import { workspaceUILayoutFromScene } from "./workspace-scene";
import {
  emptyWorkspacePaneMetadataSnapshot,
  workspacePaneMetadataSnapshotFromList,
  type WorkspacePaneMetadataSnapshot,
} from "./workspace-pane-metadata";
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

export type WorkspaceUIPaneMetadataLoad =
  | {
      error: null;
      key: string;
      snapshot: WorkspacePaneMetadataSnapshot;
      status: "loaded";
    }
  | {
      error: string;
      key: string;
      snapshot: WorkspacePaneMetadataSnapshot;
      status: "failed";
    }
  | {
      error: null;
      key: string;
      snapshot: WorkspacePaneMetadataSnapshot;
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

export function useWorkspaceUIPaneMetadataLoad(
  workspaceId: string,
  mode: WorkspaceSceneMode,
): WorkspaceUIPaneMetadataLoad {
  const key = `${mode}:${workspaceId}`;
  const [state, setState] = useState<WorkspaceUIPaneMetadataLoad>(() =>
    initialWorkspaceUIPaneMetadataLoadState(workspaceId, mode),
  );
  const unavailableError = workspaceUIPaneMetadataUnavailableError(workspaceId, mode);
  const shouldLoad = shouldLoadWorkspaceUIPaneMetadata(workspaceId, mode);

  useEffect(() => {
    if (unavailableError !== null) {
      setState({
        error: unavailableError,
        key,
        snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
        status: "failed",
      });
      return;
    }
    if (!shouldLoad) {
      setState({
        error: null,
        key,
        snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
        status: "loaded",
      });
      return;
    }

    let cancelled = false;
    setState({
      error: null,
      key,
      snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
      status: "loading",
    });
    window.setta.workspace
      .listUIPanes(workspaceId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setState({
          error: null,
          key,
          snapshot: workspacePaneMetadataSnapshotFromList(result),
          status: "loaded",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          error: `Workspace pane metadata could not be loaded: ${layoutOperationErrorMessage(error)}`,
          key,
          snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
          status: "failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [key, shouldLoad, unavailableError, workspaceId]);

  if (unavailableError !== null) {
    return {
      error: unavailableError,
      key,
      snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
      status: "failed",
    };
  }
  if (!shouldLoad) {
    return {
      error: null,
      key,
      snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
      status: "loaded",
    };
  }
  if (state.key !== key) {
    return {
      error: null,
      key,
      snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
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

export function initialWorkspaceUIPaneMetadataLoadState(
  workspaceId: string,
  mode: WorkspaceSceneMode,
): WorkspaceUIPaneMetadataLoad {
  const key = `${mode}:${workspaceId}`;
  const unavailableError = workspaceUIPaneMetadataUnavailableError(workspaceId, mode);
  if (unavailableError !== null) {
    return {
      error: unavailableError,
      key,
      snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
      status: "failed",
    };
  }
  if (shouldLoadWorkspaceUIPaneMetadata(workspaceId, mode)) {
    return {
      error: null,
      key,
      snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
      status: "loading",
    };
  }
  return {
    error: null,
    key,
    snapshot: emptyWorkspacePaneMetadataSnapshot(workspaceId),
    status: "loaded",
  };
}

export function useWorkspaceUILayoutPersistence(runtime: WorkspaceRuntime, workspaceId: string) {
  const pendingLayoutSaveRef = useRef<Promise<unknown>>(Promise.resolve());
  const [layoutPersistenceError, setLayoutPersistenceError] = useState<string | null>(null);

  const persistLayout = useCallback((): Promise<void> => {
    runtime.presentation.syncPanes(runtime.store.toScene().panes);
    if (runtime.mode !== "workspace") {
      return Promise.resolve();
    }
    const layout = workspaceUILayoutFromScene(
      workspaceId,
      runtime.store.toScene(),
      runtime.store.focusedPaneId(),
      runtime.store.getSnapshot().revision,
    );
    const save = pendingLayoutSaveRef.current
      .catch(() => {})
      .then(() => window.setta.workspace.saveUILayout(layout))
      .then(() => {
        setLayoutPersistenceError(null);
      })
      .catch((error: unknown) => {
        setLayoutPersistenceError(layoutOperationErrorMessage(error));
        throw error;
      });
    pendingLayoutSaveRef.current = save.catch(() => {});
    return save;
  }, [runtime, workspaceId]);
  const resetLayoutPersistenceError = useCallback(() => {
    setLayoutPersistenceError(null);
  }, []);

  return { layoutPersistenceError, persistLayout, resetLayoutPersistenceError };
}

export function WorkspaceUILayoutRecoveryNotice({
  layoutLoadError,
  message,
  onDismiss,
  persistLayout,
}: {
  layoutLoadError: string | null;
  message: string | null;
  onDismiss: () => void;
  persistLayout: () => Promise<void>;
}) {
  const recreatePersistedLayout = useCallback(() => {
    void persistLayout().then(onDismiss, () => {});
  }, [onDismiss, persistLayout]);

  return (
    <WorkspaceLayoutRecoveryNotice
      message={message}
      onDismiss={onDismiss}
      recreateAction={
        layoutLoadError
          ? {
              ariaLabel: "Recreate saved workspace layout",
              onClick: recreatePersistedLayout,
              title: "Recreate saved workspace layout",
            }
          : null
      }
    />
  );
}

export function workspaceLayoutRecoveryMessage({
  dismissed,
  layoutLoadError,
  paneMetadataLoadError,
  layoutPersistenceError,
  runtime,
}: {
  dismissed: boolean;
  layoutLoadError: string | null;
  paneMetadataLoadError: string | null;
  layoutPersistenceError: string | null;
  runtime: WorkspaceRuntime;
}): string | null {
  if (dismissed) {
    return null;
  }
  return (
    layoutLoadError ??
    layoutPersistenceError ??
    paneMetadataLoadError ??
    runtime.layoutRecovery?.message ??
    null
  );
}

export function workspacePaneMetadataDataAttributes(load: WorkspaceUIPaneMetadataLoad) {
  const snapshot = load.snapshot;
  return {
    "data-pane-metadata-count": snapshot.paneCount,
    "data-pane-metadata-focused-pane-id": snapshot.focusedPaneId ?? "",
    "data-pane-metadata-layout-present": snapshot.layoutPresent,
    "data-pane-metadata-readable-count": snapshot.readablePaneCount,
    "data-pane-metadata-status": load.status,
    "data-pane-metadata-writable-count": snapshot.writablePaneCount,
  };
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

function shouldLoadWorkspaceUIPaneMetadata(workspaceId: string, mode: WorkspaceSceneMode): boolean {
  return (
    mode === "workspace" &&
    workspaceId !== "empty" &&
    typeof window !== "undefined" &&
    Boolean(window.setta?.workspace?.listUIPanes)
  );
}

function workspaceUIPaneMetadataUnavailableError(
  workspaceId: string,
  mode: WorkspaceSceneMode,
): string | null {
  if (mode !== "workspace" || workspaceId === "empty" || typeof window === "undefined") {
    return null;
  }
  if (!window.setta?.workspace?.listUIPanes) {
    return "Workspace pane metadata API is unavailable";
  }
  return null;
}

function layoutOperationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workspace layout operation failed";
}
