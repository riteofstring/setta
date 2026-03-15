import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DOCK_SURFACE_MAX_WIDTH_PX,
  DOCK_WINDOW_DEFAULT_HEIGHT_PX,
  DOCK_WINDOW_DEFAULT_WIDTH_PX,
  MIN_DOCK_CHAT_HEIGHT_PX,
  MIN_DOCK_CHAT_WIDTH_PX,
} from "./projectChatBottomDockLayout";

type DockResizeDirection =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

type DockResizeSession = {
  pointerId: number;
  instanceId: string;
  direction: DockResizeDirection;
  startX: number;
  startY: number;
  startWidthPx: number;
  startHeightPx: number;
  lastWidthPx: number;
  lastHeightPx: number;
  minWidthPx: number;
  maxWidthPx: number;
  minHeightPx: number;
  maxHeightPx: number;
};

type DockResizeCommit = {
  instanceId: string;
  widthPx: number;
  heightPx: number;
};

type DockResizePill = {
  instanceId: string;
  dockPreferredWidthPx: number | null;
  bounds: {
    height: number;
  };
};

type UseProjectChatDockResizeArgs = {
  dockBottomOffsetPx: number;
  dockedWindowIdsKey: string;
  dockedPills: DockResizePill[];
  workspaceTopInsetPx: number;
  onCommitResize: (resize: DockResizeCommit) => void;
};

function clampNumber(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

function getViewportHeightPx(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  const viewportHeightPx = window.innerHeight;
  if (viewportHeightPx <= 0) {
    return null;
  }
  return viewportHeightPx;
}

function resizeDirectionIncludesAxis(
  direction: DockResizeDirection,
  axis: "left" | "right" | "top" | "bottom",
): boolean {
  return direction === axis || direction.includes(axis);
}

export function pruneDockResizePreviewEntries(
  previewById: Record<string, number>,
  allowedInstanceIds: Set<string>,
): Record<string, number> {
  let changed = false;
  const nextPreviewById: Record<string, number> = {};
  for (const [instanceId, previewValue] of Object.entries(previewById)) {
    if (!allowedInstanceIds.has(instanceId)) {
      changed = true;
      continue;
    }
    nextPreviewById[instanceId] = previewValue;
  }
  return changed ? nextPreviewById : previewById;
}

export function resolveDockResizeSession({
  pointerId,
  instanceId,
  direction,
  clientX,
  clientY,
  startWidthPx,
  startHeightPx,
  viewportHeightPx,
  workspaceTopInsetPx,
  dockBottomOffsetPx,
  dockAvailableHeightPx,
}: {
  pointerId: number;
  instanceId: string;
  direction: DockResizeDirection;
  clientX: number;
  clientY: number;
  startWidthPx: number;
  startHeightPx: number;
  viewportHeightPx: number | null;
  workspaceTopInsetPx: number;
  dockBottomOffsetPx: number;
  dockAvailableHeightPx: number;
}): DockResizeSession {
  const maxHeightFromViewport =
    viewportHeightPx === null
      ? dockAvailableHeightPx
      : viewportHeightPx - workspaceTopInsetPx - dockBottomOffsetPx;
  return {
    pointerId,
    instanceId,
    direction,
    startX: clientX,
    startY: clientY,
    startWidthPx,
    startHeightPx,
    lastWidthPx: startWidthPx,
    lastHeightPx: startHeightPx,
    minWidthPx: MIN_DOCK_CHAT_WIDTH_PX,
    maxWidthPx: DOCK_SURFACE_MAX_WIDTH_PX,
    minHeightPx: MIN_DOCK_CHAT_HEIGHT_PX,
    maxHeightPx: clampNumber(
      maxHeightFromViewport,
      MIN_DOCK_CHAT_HEIGHT_PX,
      dockAvailableHeightPx,
    ),
  };
}

export function resolveDockResizePreview(
  activeResize: DockResizeSession,
  pointerPosition: { clientX: number; clientY: number },
): Pick<DockResizeCommit, "widthPx" | "heightPx"> {
  const deltaX = pointerPosition.clientX - activeResize.startX;
  const deltaY = pointerPosition.clientY - activeResize.startY;
  let nextWidthPx = activeResize.startWidthPx;
  let nextHeightPx = activeResize.startHeightPx;

  if (resizeDirectionIncludesAxis(activeResize.direction, "left")) {
    nextWidthPx = activeResize.startWidthPx - deltaX;
  } else if (resizeDirectionIncludesAxis(activeResize.direction, "right")) {
    nextWidthPx = activeResize.startWidthPx + deltaX;
  }

  if (resizeDirectionIncludesAxis(activeResize.direction, "top")) {
    nextHeightPx = activeResize.startHeightPx - deltaY;
  } else if (resizeDirectionIncludesAxis(activeResize.direction, "bottom")) {
    nextHeightPx = activeResize.startHeightPx + deltaY;
  }

  return {
    widthPx: clampNumber(
      nextWidthPx,
      activeResize.minWidthPx,
      activeResize.maxWidthPx,
    ),
    heightPx: clampNumber(
      nextHeightPx,
      activeResize.minHeightPx,
      activeResize.maxHeightPx,
    ),
  };
}

function removeDockResizePreviewEntry(
  previewById: Record<string, number>,
  instanceId: string,
): Record<string, number> {
  if (!(instanceId in previewById)) {
    return previewById;
  }
  const nextPreviewById = { ...previewById };
  delete nextPreviewById[instanceId];
  return nextPreviewById;
}

export function useProjectChatDockResize({
  dockBottomOffsetPx,
  dockedWindowIdsKey,
  dockedPills,
  workspaceTopInsetPx,
  onCommitResize,
}: UseProjectChatDockResizeArgs): {
  dockPreviewWidthsById: Record<string, number>;
  dockPreviewHeightsById: Record<string, number>;
  handleSingleDockResizePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    instanceId: string,
    direction: DockResizeDirection,
  ) => void;
  handleSingleDockResizePointerMove: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  handleSingleDockResizePointerUp: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
} {
  const [dockPreviewWidthsById, setDockPreviewWidthsById] = useState<
    Record<string, number>
  >({});
  const [dockPreviewHeightsById, setDockPreviewHeightsById] = useState<
    Record<string, number>
  >({});
  const activeSingleDockResizeRef = useRef<DockResizeSession | null>(null);
  const dockedPillsById = useMemo(
    () =>
      Object.fromEntries(dockedPills.map((pill) => [pill.instanceId, pill])),
    [dockedPills],
  );

  useEffect(() => {
    activeSingleDockResizeRef.current = null;
    const allowedDockedWindowIds = new Set(
      dockedWindowIdsKey
        .split("|")
        .map((windowId) => windowId.trim())
        .filter((windowId) => windowId.length > 0),
    );
    setDockPreviewWidthsById((current) =>
      pruneDockResizePreviewEntries(current, allowedDockedWindowIds),
    );
    setDockPreviewHeightsById((current) =>
      pruneDockResizePreviewEntries(current, allowedDockedWindowIds),
    );
  }, [dockedWindowIdsKey]);

  const handleSingleDockResizePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      instanceId: string,
      direction: DockResizeDirection,
    ) => {
      if (event.button !== 0) {
        return;
      }
      const panelNode = event.currentTarget.closest(
        `[data-chat-window-instance-id="${instanceId}"]`,
      );
      const panelBounds = panelNode?.getBoundingClientRect();
      const dockedPill = dockedPillsById[instanceId];
      const viewportHeightPx = getViewportHeightPx();
      const startWidthPx =
        panelBounds?.width ??
        dockedPill?.dockPreferredWidthPx ??
        DOCK_WINDOW_DEFAULT_WIDTH_PX;
      const startHeightPx =
        panelBounds?.height ??
        dockedPill?.bounds.height ??
        DOCK_WINDOW_DEFAULT_HEIGHT_PX;
      activeSingleDockResizeRef.current = resolveDockResizeSession({
        pointerId: event.pointerId,
        instanceId,
        direction,
        clientX: event.clientX,
        clientY: event.clientY,
        startWidthPx,
        startHeightPx,
        viewportHeightPx,
        workspaceTopInsetPx,
        dockBottomOffsetPx,
        dockAvailableHeightPx: Math.max(
          MIN_DOCK_CHAT_HEIGHT_PX,
          (viewportHeightPx ?? 900) - workspaceTopInsetPx - dockBottomOffsetPx,
        ),
      });
      setDockPreviewWidthsById((current) => ({
        ...current,
        [instanceId]: startWidthPx,
      }));
      setDockPreviewHeightsById((current) => ({
        ...current,
        [instanceId]: startHeightPx,
      }));
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [dockBottomOffsetPx, dockedPillsById, workspaceTopInsetPx],
  );

  const handleSingleDockResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const activeResize = activeSingleDockResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      const nextPreview = resolveDockResizePreview(activeResize, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      activeResize.lastWidthPx = nextPreview.widthPx;
      activeResize.lastHeightPx = nextPreview.heightPx;
      setDockPreviewWidthsById((current) => {
        if (current[activeResize.instanceId] === nextPreview.widthPx) {
          return current;
        }
        return {
          ...current,
          [activeResize.instanceId]: nextPreview.widthPx,
        };
      });
      setDockPreviewHeightsById((current) => {
        if (current[activeResize.instanceId] === nextPreview.heightPx) {
          return current;
        }
        return {
          ...current,
          [activeResize.instanceId]: nextPreview.heightPx,
        };
      });
    },
    [],
  );

  const handleSingleDockResizePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const activeResize = activeSingleDockResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      onCommitResize({
        instanceId: activeResize.instanceId,
        widthPx: activeResize.lastWidthPx,
        heightPx: activeResize.lastHeightPx,
      });
      setDockPreviewWidthsById((current) =>
        removeDockResizePreviewEntry(current, activeResize.instanceId),
      );
      setDockPreviewHeightsById((current) =>
        removeDockResizePreviewEntry(current, activeResize.instanceId),
      );
      activeSingleDockResizeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [onCommitResize],
  );

  return {
    dockPreviewWidthsById,
    dockPreviewHeightsById,
    handleSingleDockResizePointerDown,
    handleSingleDockResizePointerMove,
    handleSingleDockResizePointerUp,
  };
}
