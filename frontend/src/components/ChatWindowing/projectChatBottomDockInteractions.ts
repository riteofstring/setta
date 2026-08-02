import {
  buildFloatingSnapBounds,
  resolveFloatingSnapPresetFromPointer,
  type FloatingSnapPreset,
  type FloatingWindowBoundaryInsets,
} from "components/ChatWindowing/projectChatSnapLayout";
import { type ChatWindowBounds } from "utils/generatedTypes";

type StripItemLayoutAnimationPlan = {
  itemKey: string;
  node: HTMLElement;
  initialTransform: string;
  finalTransform: string;
};

type FloatingDragMoveState = {
  instanceId: string;
  startX: number;
  startY: number;
  startBounds: ChatWindowBounds;
  dragBoundsStart: ChatWindowBounds;
  restoreBoundsOnUnsnap: ChatWindowBounds | null;
  hasActivatedUnsnap: boolean;
};

type FloatingDragSnapPreview = {
  instanceId: string;
  preset: FloatingSnapPreset;
  bounds: ChatWindowBounds;
};

function resolveFloatingDragSnapPreview({
  instanceId,
  pointerX,
  pointerY,
  viewportWidthPx,
  viewportHeightPx,
  insets,
}: {
  instanceId: string;
  pointerX: number;
  pointerY: number;
  viewportWidthPx: number | null;
  viewportHeightPx: number | null;
  insets: FloatingWindowBoundaryInsets;
}): FloatingDragSnapPreview | null {
  if (viewportWidthPx === null || viewportHeightPx === null) {
    return null;
  }
  const preset = resolveFloatingSnapPresetFromPointer({
    pointerX,
    pointerY,
    viewportWidthPx,
    viewportHeightPx,
    insets,
  });
  if (!preset) {
    return null;
  }
  return {
    instanceId,
    preset,
    bounds: buildFloatingSnapBounds(
      preset,
      viewportWidthPx,
      viewportHeightPx,
      insets,
    ),
  };
}

export function collectStripItemLayoutAnimations({
  renderedStripItemKeys,
  nodesByItemKey,
  previousRectsByItemKey,
  hasMounted,
}: {
  renderedStripItemKeys: readonly string[];
  nodesByItemKey: Record<string, HTMLElement>;
  previousRectsByItemKey: Record<string, DOMRect>;
  hasMounted: boolean;
}): {
  nextRectsByItemKey: Record<string, DOMRect>;
  animations: StripItemLayoutAnimationPlan[];
} {
  const nextRectsByItemKey: Record<string, DOMRect> = {};
  const animations: StripItemLayoutAnimationPlan[] = [];

  for (const itemKey of renderedStripItemKeys) {
    const node = nodesByItemKey[itemKey];
    if (!node) {
      continue;
    }
    const nextRect = node.getBoundingClientRect();
    nextRectsByItemKey[itemKey] = nextRect;
    const previousRect = previousRectsByItemKey[itemKey];
    if (previousRect) {
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) <= 0.5 && Math.abs(deltaY) <= 0.5) {
        continue;
      }
      animations.push({
        itemKey,
        node,
        initialTransform: `translate(${deltaX}px, ${deltaY}px)`,
        finalTransform: "translate(0px, 0px)",
      });
      continue;
    }
    if (!hasMounted) {
      continue;
    }
    animations.push({
      itemKey,
      node,
      initialTransform: "translateY(8px) scale(0.96)",
      finalTransform: "translateY(0px) scale(1)",
    });
  }

  return {
    nextRectsByItemKey,
    animations,
  };
}

export function resolveFloatingDragMove({
  activeDrag,
  pointerX,
  pointerY,
  unsnapThresholdPx,
  viewportWidthPx,
  viewportHeightPx,
  insets,
  clampBounds,
}: {
  activeDrag: FloatingDragMoveState;
  pointerX: number;
  pointerY: number;
  unsnapThresholdPx: number;
  viewportWidthPx: number | null;
  viewportHeightPx: number | null;
  insets: FloatingWindowBoundaryInsets;
  clampBounds: (bounds: ChatWindowBounds) => ChatWindowBounds;
}): {
  hasActivatedUnsnap: boolean;
  nextBounds: ChatWindowBounds;
  nextSnapPreview: FloatingDragSnapPreview | null;
} {
  const deltaX = pointerX - activeDrag.startX;
  const deltaY = pointerY - activeDrag.startY;
  const dragDistance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  const hasActivatedUnsnap =
    activeDrag.hasActivatedUnsnap ||
    (activeDrag.restoreBoundsOnUnsnap !== null &&
      dragDistance >= unsnapThresholdPx);
  const dragBoundsStart = hasActivatedUnsnap
    ? activeDrag.dragBoundsStart
    : activeDrag.startBounds;

  return {
    hasActivatedUnsnap,
    nextBounds: clampBounds({
      ...dragBoundsStart,
      x: dragBoundsStart.x + deltaX,
      y: dragBoundsStart.y + deltaY,
    }),
    nextSnapPreview: resolveFloatingDragSnapPreview({
      instanceId: activeDrag.instanceId,
      pointerX,
      pointerY,
      viewportWidthPx,
      viewportHeightPx,
      insets,
    }),
  };
}

export function resolveSingleDockResizeMetrics({
  panelBounds,
  resolvedWidthPx,
  resolvedHeightPx,
  viewportHeightPx,
  workspaceTopInsetPx,
  dockBottomOffsetPx,
  dockAvailableHeightPx,
  defaultWidthPx,
  defaultHeightPx,
  minHeightPx,
}: {
  panelBounds: DOMRect | undefined;
  resolvedWidthPx: number | undefined;
  resolvedHeightPx: number | undefined;
  viewportHeightPx: number | null;
  workspaceTopInsetPx: number;
  dockBottomOffsetPx: number;
  dockAvailableHeightPx: number;
  defaultWidthPx: number;
  defaultHeightPx: number;
  minHeightPx: number;
}): {
  startWidthPx: number;
  startHeightPx: number;
  maxHeightPx: number;
} {
  const maxHeightFromViewport =
    viewportHeightPx === null
      ? dockAvailableHeightPx
      : viewportHeightPx - workspaceTopInsetPx - dockBottomOffsetPx;
  return {
    startWidthPx: panelBounds?.width ?? resolvedWidthPx ?? defaultWidthPx,
    startHeightPx: panelBounds?.height ?? resolvedHeightPx ?? defaultHeightPx,
    maxHeightPx: Math.max(
      minHeightPx,
      Math.min(maxHeightFromViewport, dockAvailableHeightPx),
    ),
  };
}
