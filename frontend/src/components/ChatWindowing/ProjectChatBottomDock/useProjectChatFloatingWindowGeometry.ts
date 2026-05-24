import {
  buildFloatingSnapResizeHandles,
  resolveFloatingSnapPresetFromBounds,
  type FloatingSnapPreset,
  type FloatingWindowBoundaryInsets,
} from "components/ChatWindowing/projectChatSnapLayout";
import {
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { type ChatWindowBounds } from "utils/generatedTypes";
import {
  ActiveFloatingDrag,
  ActiveFloatingResize,
  ActiveFloatingSnapPreview,
  ActiveFloatingSnapResize,
  ResolvedWindowPill,
} from "./shared";

type UseProjectChatFloatingWindowGeometryInput = {
  activeFloatingDragRef: MutableRefObject<ActiveFloatingDrag | null>;
  activeFloatingResizeRef: MutableRefObject<ActiveFloatingResize | null>;
  activeFloatingSnapPreviewRef: MutableRefObject<ActiveFloatingSnapPreview | null>;
  activeFloatingSnapResizeRef: MutableRefObject<ActiveFloatingSnapResize | null>;
  floatingPreviewBoundsById: Record<string, ChatWindowBounds>;
  floatingWindowBoundaryInsets: FloatingWindowBoundaryInsets;
  openFloatingPills: readonly ResolvedWindowPill[];
  setActiveFloatingSnapPreview: Dispatch<
    SetStateAction<ActiveFloatingSnapPreview | null>
  >;
  setFloatingPreviewBoundsById: Dispatch<
    SetStateAction<Record<string, ChatWindowBounds>>
  >;
  viewportHeightPx: number;
  viewportWidthPx: number;
};

export function useProjectChatFloatingWindowGeometry({
  activeFloatingDragRef,
  activeFloatingResizeRef,
  activeFloatingSnapPreviewRef,
  activeFloatingSnapResizeRef,
  floatingPreviewBoundsById,
  floatingWindowBoundaryInsets,
  openFloatingPills,
  setActiveFloatingSnapPreview,
  setFloatingPreviewBoundsById,
  viewportHeightPx,
  viewportWidthPx,
}: UseProjectChatFloatingWindowGeometryInput) {
  const floatingBoundsById = useMemo(() => {
    const nextBoundsById: Record<string, ChatWindowBounds> = {};
    for (const pill of openFloatingPills) {
      nextBoundsById[pill.instanceId] =
        floatingPreviewBoundsById[pill.instanceId] ?? pill.bounds;
    }
    return nextBoundsById;
  }, [floatingPreviewBoundsById, openFloatingPills]);

  const snappedFloatingWindows = useMemo(() => {
    if (viewportWidthPx <= 0 || viewportHeightPx <= 0) {
      return [];
    }
    return openFloatingPills.flatMap((pill) => {
      const bounds = floatingBoundsById[pill.instanceId];
      if (!bounds) {
        return [];
      }
      const snapPreset = resolveFloatingSnapPresetFromBounds(
        bounds,
        viewportWidthPx,
        viewportHeightPx,
        floatingWindowBoundaryInsets,
      );
      if (!snapPreset) {
        return [];
      }
      return [
        {
          instanceId: pill.instanceId,
          bounds,
          snapPreset,
        },
      ];
    });
  }, [
    floatingBoundsById,
    floatingWindowBoundaryInsets,
    openFloatingPills,
    viewportHeightPx,
    viewportWidthPx,
  ]);

  const floatingSnapPresetById = useMemo(() => {
    const nextPresetById: Record<string, FloatingSnapPreset> = {};
    for (const snappedWindow of snappedFloatingWindows) {
      nextPresetById[snappedWindow.instanceId] = snappedWindow.snapPreset;
    }
    return nextPresetById;
  }, [snappedFloatingWindows]);

  const floatingSnapResizeHandles = useMemo(
    () => buildFloatingSnapResizeHandles(snappedFloatingWindows),
    [snappedFloatingWindows],
  );

  const floatingWindowIdsKey = useMemo(
    () => openFloatingPills.map((pill) => pill.instanceId).join("|"),
    [openFloatingPills],
  );

  useEffect(() => {
    activeFloatingDragRef.current = null;
    activeFloatingResizeRef.current = null;
    activeFloatingSnapResizeRef.current = null;
    activeFloatingSnapPreviewRef.current = null;
    setActiveFloatingSnapPreview(null);
    if (!floatingWindowIdsKey) {
      setFloatingPreviewBoundsById({});
      return;
    }
    const allowedIds = new Set(
      openFloatingPills.map((pill) => pill.instanceId),
    );
    setFloatingPreviewBoundsById((current) => {
      let changed = false;
      const next: Record<string, ChatWindowBounds> = {};
      for (const [instanceId, bounds] of Object.entries(current)) {
        if (!allowedIds.has(instanceId)) {
          changed = true;
          continue;
        }
        next[instanceId] = bounds;
      }
      return changed ? next : current;
    });
  }, [
    activeFloatingDragRef,
    activeFloatingResizeRef,
    activeFloatingSnapPreviewRef,
    activeFloatingSnapResizeRef,
    floatingWindowIdsKey,
    openFloatingPills,
    setActiveFloatingSnapPreview,
    setFloatingPreviewBoundsById,
  ]);

  return {
    floatingBoundsById,
    floatingSnapPresetById,
    floatingSnapResizeHandles,
  };
}
