import type { WorkspaceUILayout } from "@generated/backend";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { WorkspaceLayoutStore } from "./layout-store";
import { installWindowResizeReportHooks } from "./performance-report";
import type { Rect } from "./types";
import type { WorkspaceRuntime } from "./workspace-runtime";

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
  }>(() => ({
    key: liveLayoutKey,
    layout: initialLayout,
  }));
  useEffect(() => {
    setLiveLayoutState({
      key: liveLayoutKey,
      layout: initialLayout,
    });
  }, [initialLayout, liveLayoutKey]);
  const liveLayout = liveLayoutState.key === liveLayoutKey ? liveLayoutState.layout : initialLayout;
  const applyWorkspaceUIEventLayout = useCallback(
    (layout: WorkspaceUILayout) => {
      setLiveLayoutState((current) => {
        if (current.key !== liveLayoutKey) {
          return current;
        }
        if ((current.layout?.revision ?? 0) >= layout.revision) {
          return current;
        }
        return {
          key: liveLayoutKey,
          layout,
        };
      });
    },
    [liveLayoutKey],
  );
  return { applyWorkspaceUIEventLayout, liveLayout };
}
