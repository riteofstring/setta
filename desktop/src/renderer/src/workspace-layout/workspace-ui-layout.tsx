import type { WorkspaceUIEvent, WorkspaceUILayout } from "@generated/backend";
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

export type WorkspaceUILayoutEventDecision =
  | {
      kind: "apply";
      layout: WorkspaceUILayout;
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "ignore";
    }
  | {
      kind: "resync";
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
    const unavailableError = workspaceUILayoutUnavailableError(workspaceId, mode);
    if (unavailableError !== null) {
      setState({
        error: unavailableError,
        key,
        layout: null,
        status: "failed",
      });
      return;
    }
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
    loadWorkspaceUILayout(workspaceId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setState({
          error: null,
          key,
          layout: result,
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
  }, [key, mode, shouldLoad, workspaceId]);

  const unavailableError = workspaceUILayoutUnavailableError(workspaceId, mode);
  if (unavailableError !== null) {
    return {
      error: unavailableError,
      key,
      layout: null,
      status: "failed",
    };
  }
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

export async function loadWorkspaceUILayout(
  workspaceId: string,
): Promise<WorkspaceUILayout | null> {
  const result = await window.setta.workspace.readUILayout(workspaceId);
  if (result.workspaceId !== workspaceId) {
    throw new Error(
      `Workspace UI layout read workspace ${result.workspaceId} does not match ${workspaceId}`,
    );
  }
  if (result.layout !== null) {
    return checkedWorkspaceUILayout(result.layout, workspaceId);
  }
  const initializeUILayout = window.setta.workspace.initializeUILayout;
  if (!initializeUILayout) {
    throw new Error("Workspace UI layout initialize API is unavailable");
  }
  return checkedWorkspaceUILayout(await initializeUILayout(workspaceId), workspaceId);
}

function checkedWorkspaceUILayout(
  layout: WorkspaceUILayout,
  workspaceId: string,
): WorkspaceUILayout {
  if (layout.workspaceId !== workspaceId) {
    throw new Error(
      `Workspace UI layout workspace ${layout.workspaceId} does not match ${workspaceId}`,
    );
  }
  return layout;
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
  const unavailableError = workspaceUILayoutUnavailableError(workspaceId, mode);
  if (unavailableError !== null) {
    return {
      error: unavailableError,
      key,
      layout: null,
      status: "failed",
    };
  }
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

export function useWorkspaceUILayoutReset({
  onLayoutReset,
  workspaceId,
}: {
  onLayoutReset: (layout: WorkspaceUILayout) => void;
  workspaceId: string;
}) {
  const [layoutResetError, setLayoutResetError] = useState<string | null>(null);
  const resetLayout = useCallback((): Promise<void> => {
    return window.setta.workspace
      .resetUILayout(workspaceId)
      .then((layout) => {
        setLayoutResetError(null);
        onLayoutReset(layout);
      })
      .catch((error: unknown) => {
        setLayoutResetError(
          `Workspace UI layout reset failed: ${layoutOperationErrorMessage(error)}`,
        );
        throw error;
      });
  }, [onLayoutReset, workspaceId]);
  const resetLayoutResetError = useCallback(() => {
    setLayoutResetError(null);
  }, []);
  return { layoutResetError, resetLayout, resetLayoutResetError };
}

export function useWorkspaceUILayoutEventSync({
  mode,
  onLayoutUpdate,
  runtime,
  workspaceId,
}: {
  mode: WorkspaceSceneMode;
  onLayoutUpdate: (layout: WorkspaceUILayout) => void;
  runtime: WorkspaceRuntime;
  workspaceId: string;
}): string | null {
  const [layoutEventSyncError, setLayoutEventSyncError] = useState<string | null>(null);
  const unavailableError = workspaceUILayoutEventSyncUnavailableError(workspaceId, mode);
  const shouldSubscribe = shouldSubscribeWorkspaceUILayoutEvents(workspaceId, mode);

  useEffect(() => {
    if (unavailableError !== null) {
      setLayoutEventSyncError(unavailableError);
      return;
    }
    if (!shouldSubscribe) {
      setLayoutEventSyncError(null);
      return;
    }

    let cancelled = false;
    const unsubscribe = window.setta.workspace.onUIEvent(workspaceId, (event) => {
      const decision = workspaceUILayoutEventDecision(
        event,
        runtime.store.getSnapshot().revision,
        workspaceId,
      );
      switch (decision.kind) {
        case "apply":
          setLayoutEventSyncError(null);
          onLayoutUpdate(decision.layout);
          return;
        case "error":
          setLayoutEventSyncError(decision.message);
          return;
        case "ignore":
          return;
        case "resync":
          void window.setta.workspace
            .readUILayout(workspaceId)
            .then((result) => {
              if (cancelled) {
                return;
              }
              const layout = result.layout;
              if (layout === null) {
                setLayoutEventSyncError(
                  "Workspace UI event stream requested resync but no persisted layout is available",
                );
                return;
              }
              const resyncDecision = workspaceUILayoutFromResyncDecision(
                layout,
                runtime.store.getSnapshot().revision,
                workspaceId,
              );
              if (resyncDecision.kind === "apply") {
                setLayoutEventSyncError(null);
                onLayoutUpdate(resyncDecision.layout);
                return;
              }
              if (resyncDecision.kind === "error") {
                setLayoutEventSyncError(resyncDecision.message);
              }
            })
            .catch((error: unknown) => {
              if (!cancelled) {
                setLayoutEventSyncError(
                  `Workspace UI event stream resync failed: ${layoutOperationErrorMessage(error)}`,
                );
              }
            });
          return;
        default: {
          const exhaustive: never = decision;
          throw new Error(`unsupported workspace UI event decision: ${String(exhaustive)}`);
        }
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [mode, onLayoutUpdate, runtime, shouldSubscribe, unavailableError, workspaceId]);

  return layoutEventSyncError;
}

export function WorkspaceUILayoutRecoveryNotice({
  layoutLoadError,
  message,
  onDismiss,
  resetLayout,
}: {
  layoutLoadError: string | null;
  message: string | null;
  onDismiss: () => void;
  resetLayout: () => Promise<void>;
}) {
  const recreatePersistedLayout = useCallback(() => {
    void resetLayout().then(onDismiss, () => {});
  }, [onDismiss, resetLayout]);

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
  layoutEventSyncError,
  layoutLoadError,
  paneMetadataLoadError,
  layoutPersistenceError,
  layoutResetError,
  runtime,
}: {
  dismissed: boolean;
  layoutEventSyncError: string | null;
  layoutLoadError: string | null;
  paneMetadataLoadError: string | null;
  layoutPersistenceError: string | null;
  layoutResetError: string | null;
  runtime: WorkspaceRuntime;
}): string | null {
  if (dismissed) {
    return null;
  }
  return (
    layoutResetError ??
    layoutLoadError ??
    layoutPersistenceError ??
    layoutEventSyncError ??
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

function workspaceUILayoutUnavailableError(
  workspaceId: string,
  mode: WorkspaceSceneMode,
): string | null {
  if (mode !== "workspace" || workspaceId === "empty" || typeof window === "undefined") {
    return null;
  }
  if (!window.setta?.workspace?.readUILayout) {
    return "Workspace UI layout read API is unavailable";
  }
  return null;
}

function shouldLoadWorkspaceUIPaneMetadata(workspaceId: string, mode: WorkspaceSceneMode): boolean {
  return (
    mode === "workspace" &&
    workspaceId !== "empty" &&
    typeof window !== "undefined" &&
    Boolean(window.setta?.workspace?.listUIPanes)
  );
}

function shouldSubscribeWorkspaceUILayoutEvents(
  workspaceId: string,
  mode: WorkspaceSceneMode,
): boolean {
  return (
    mode === "workspace" &&
    workspaceId !== "empty" &&
    typeof window !== "undefined" &&
    Boolean(window.setta?.workspace?.onUIEvent)
  );
}

function workspaceUILayoutEventSyncUnavailableError(
  workspaceId: string,
  mode: WorkspaceSceneMode,
): string | null {
  if (mode !== "workspace" || workspaceId === "empty" || typeof window === "undefined") {
    return null;
  }
  if (!window.setta?.workspace?.onUIEvent) {
    return "Workspace UI event stream API is unavailable";
  }
  return null;
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

export function workspaceUILayoutEventDecision(
  event: WorkspaceUIEvent,
  currentRevision: number,
  workspaceId: string,
): WorkspaceUILayoutEventDecision {
  if (event.workspaceId !== workspaceId) {
    return { kind: "ignore" };
  }
  switch (event.type) {
    case "workspace_ui.layout_updated":
      if (event.layout === null) {
        return {
          kind: "error",
          message: "Workspace UI layout update event did not include a layout",
        };
      }
      if (event.layout.revision !== event.revision) {
        return {
          kind: "error",
          message: `Workspace UI layout event revision ${event.revision} does not match layout revision ${event.layout.revision}`,
        };
      }
      return workspaceUILayoutFromResyncDecision(event.layout, currentRevision, workspaceId);
    case "workspace_ui.resync_required":
      if (event.resync === null) {
        return {
          kind: "error",
          message: "Workspace UI resync event did not include resync details",
        };
      }
      return event.revision <= currentRevision ? { kind: "ignore" } : { kind: "resync" };
    default: {
      const exhaustive: never = event.type;
      return {
        kind: "error",
        message: `Workspace UI event type is unsupported: ${String(exhaustive)}`,
      };
    }
  }
}

function workspaceUILayoutFromResyncDecision(
  layout: WorkspaceUILayout,
  currentRevision: number,
  workspaceId: string,
): WorkspaceUILayoutEventDecision {
  if (layout.workspaceId !== workspaceId) {
    return {
      kind: "error",
      message: `Workspace UI layout workspace ${layout.workspaceId} does not match ${workspaceId}`,
    };
  }
  if (layout.revision <= currentRevision) {
    return { kind: "ignore" };
  }
  return { kind: "apply", layout };
}
