import type { WorkspaceUILayout } from "@generated/backend";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { WorkspaceLayoutStore, WorkspaceLayoutTransientSnapshot } from "./layout-store";
import { installWindowResizeReportHooks } from "./performance-report";
import type { Rect } from "./types";
import type { WorkspaceRuntime } from "./workspace-runtime";
import { workspaceUILayoutsEqual } from "./workspace-layout-equality";

export function installResizeReportHooksForRuntime(
  runtime: WorkspaceRuntime,
  viewportProvider: () => Rect,
): () => void {
  if (runtime.mode !== "benchmark") {
    return () => {};
  }
  return installWindowResizeReportHooks({
    metrics: runtime.metrics,
    viewportProvider,
    writer: runtime.resizeReportWriter,
  });
}

export function useWorkspaceLayoutSnapshot(store: WorkspaceLayoutStore) {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}

export function useWorkspaceUILiveLayout({
  initialLayout,
  mode,
  workspaceId,
}: {
  initialLayout: WorkspaceUILayout | null;
  mode: string;
  workspaceId: string;
}) {
  const liveLayoutKey = `${mode}:${workspaceId}`;
  const [liveLayoutState, setLiveLayoutState] = useState<{
    key: string;
    layout: WorkspaceUILayout | null;
    transientSnapshot: WorkspaceLayoutTransientSnapshot | null;
  }>(() => ({
    key: liveLayoutKey,
    layout: initialLayout,
    transientSnapshot: null,
  }));
  useEffect(() => {
    setLiveLayoutState({
      key: liveLayoutKey,
      layout: initialLayout,
      transientSnapshot: null,
    });
  }, [initialLayout, liveLayoutKey]);
  const liveLayout = liveLayoutState.key === liveLayoutKey ? liveLayoutState.layout : initialLayout;
  const liveLayoutTransientSnapshot =
    liveLayoutState.key === liveLayoutKey ? liveLayoutState.transientSnapshot : null;
  const applyWorkspaceUICommandLayout = useCallback(
    (
      layout: WorkspaceUILayout,
      transientSnapshot: WorkspaceLayoutTransientSnapshot | null = null,
    ) => {
      setLiveLayoutState((current) =>
        workspaceUILiveLayoutStateAfterUpdate(
          current,
          liveLayoutKey,
          layout,
          "command",
          transientSnapshot,
        ),
      );
    },
    [liveLayoutKey],
  );
  const applyWorkspaceUIEventLayout = useCallback(
    (layout: WorkspaceUILayout) => {
      setLiveLayoutState((current) =>
        workspaceUILiveLayoutStateAfterUpdate(current, liveLayoutKey, layout, "event", null),
      );
    },
    [liveLayoutKey],
  );
  return {
    applyWorkspaceUICommandLayout,
    applyWorkspaceUIEventLayout,
    liveLayout,
    liveLayoutTransientSnapshot,
  };
}

export type WorkspaceUILiveLayoutUpdateSource = "command" | "event";

export function workspaceUILiveLayoutStateAfterUpdate(
  current: {
    key: string;
    layout: WorkspaceUILayout | null;
    transientSnapshot: WorkspaceLayoutTransientSnapshot | null;
  },
  liveLayoutKey: string,
  layout: WorkspaceUILayout,
  source: WorkspaceUILiveLayoutUpdateSource,
  transientSnapshot: WorkspaceLayoutTransientSnapshot | null = null,
): {
  key: string;
  layout: WorkspaceUILayout | null;
  transientSnapshot: WorkspaceLayoutTransientSnapshot | null;
} {
  if (shouldIgnoreWorkspaceUILayoutUpdate(current, liveLayoutKey, layout, source)) {
    return current;
  }
  return {
    key: liveLayoutKey,
    layout,
    transientSnapshot,
  };
}

function shouldIgnoreWorkspaceUILayoutUpdate(
  current: {
    key: string;
    layout: WorkspaceUILayout | null;
    transientSnapshot: WorkspaceLayoutTransientSnapshot | null;
  },
  liveLayoutKey: string,
  layout: WorkspaceUILayout,
  source: WorkspaceUILiveLayoutUpdateSource,
): boolean {
  if (current.key !== liveLayoutKey) {
    return true;
  }
  const currentRevision = current.layout?.revision ?? 0;
  if (source === "event") {
    return currentRevision >= layout.revision;
  }
  if (currentRevision > layout.revision) {
    return true;
  }
  return currentRevision === layout.revision && workspaceUILayoutsEqual(current.layout, layout);
}
