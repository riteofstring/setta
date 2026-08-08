import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useDndState } from "forks/dnd-kit/dndState";
import _ from "lodash";
import { forwardRef } from "react";
import { createPortal } from "react-dom";
import { TbDragDrop } from "react-icons/tb";
import { resolveRectBoundsFromMap, type DragRectLike } from "./dragRectBounds";

export const TempDNDSection = forwardRef<HTMLDivElement, Record<string, never>>(
  (_props, ref) => {
    const { width, height } = useDndState(
      (x) => ({
        width: x.width,
        height: x.height,
      }),
      _.isEqual,
    );
    const placeholderStyle = { width: `${width}px`, height: `${height}px` };
    const placeholderClassName =
      "flex items-center justify-center rounded-xl bg-setta-100/70 shadow-inner dark:bg-setta-500/60";

    // The 2nd div (flex-auto) is needed to make dnd work from the right
    return (
      <>
        <div
          style={placeholderStyle}
          className={placeholderClassName}
          data-dnd-placeholder="true"
          ref={ref}
        >
          <TbDragDrop className="scale-150 text-xl font-black text-setta-50 dark:text-setta-400/70" />
        </div>
        <div className="flex-auto bg-transparent" />
      </>
    );
  },
);

type OverlayRect = Pick<DragRectLike, "top" | "left" | "width" | "height">;
type DragTransform = {
  x: number;
  y: number;
};

function resolveOverlayRect(
  draggingRectsById: Record<string, DragRectLike> | null,
  fallbackRect: DragRectLike | null,
): OverlayRect | null {
  return resolveRectBoundsFromMap(draggingRectsById) ?? fallbackRect;
}

function resolveDragOverlayState(
  manager: ReturnType<typeof useDragDropManager>,
): {
  dragTransform: DragTransform;
  isDragging: boolean;
  isDropped: boolean;
  shouldRenderOverlay: boolean;
} {
  if (!manager) {
    return {
      dragTransform: { x: 0, y: 0 },
      isDragging: false,
      isDropped: false,
      shouldRenderOverlay: false,
    };
  }

  const { status, transform } = manager.dragOperation;
  return {
    dragTransform: {
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
    },
    isDragging: status.dragging,
    isDropped: status.dropped,
    shouldRenderOverlay: status.initialized,
  };
}

function resolveOverlayRenderState({
  dragTransform,
  draggingCount,
  isDragging,
  isDropped,
  overlayRectBase,
  shouldRenderOverlay,
}: {
  dragTransform: DragTransform;
  draggingCount: number;
  isDragging: boolean;
  isDropped: boolean;
  overlayRectBase: OverlayRect | null;
  shouldRenderOverlay: boolean;
}) {
  if (!shouldRenderOverlay || isDropped || !isDragging || !overlayRectBase) {
    return null;
  }

  return {
    className:
      draggingCount > 1
        ? "rounded-xl border-2 border-blue-400/70 bg-blue-500/20 shadow-lg dark:border-blue-400/60 dark:bg-blue-700/20"
        : "rounded-xl bg-blue-500/90 shadow-lg dark:bg-blue-700/90",
    overlayRect: {
      top: overlayRectBase.top + dragTransform.y,
      left: overlayRectBase.left + dragTransform.x,
      width: overlayRectBase.width,
      height: overlayRectBase.height,
    },
  };
}

export const DummyDragOverlay = forwardRef<
  HTMLDivElement,
  Record<string, never>
>((_props, ref) => {
  const manager = useDragDropManager();
  const { draggingRectsById, activeRect, draggingIds } = useDndState(
    (state) => ({
      draggingRectsById: state.draggingRectsById,
      activeRect: state.activeRect,
      draggingIds: state.draggingIds,
    }),
    _.isEqual,
  );
  const overlayState = useComputed(
    () => resolveDragOverlayState(manager),
    [manager],
  ).value;
  const overlay = resolveOverlayRenderState({
    dragTransform: overlayState.dragTransform,
    draggingCount: draggingIds.length,
    isDragging: overlayState.isDragging,
    isDropped: overlayState.isDropped,
    overlayRectBase: resolveOverlayRect(draggingRectsById, activeRect),
    shouldRenderOverlay: overlayState.shouldRenderOverlay,
  });
  if (!overlay) {
    return null;
  }

  return createPortal(
    <div
      className={overlay.className}
      style={{
        position: "fixed",
        top: overlay.overlayRect.top,
        left: overlay.overlayRect.left,
        width: overlay.overlayRect.width,
        height: overlay.overlayRect.height,
        pointerEvents: "none",
        zIndex: 1000,
      }}
      ref={ref}
    />,
    document.body,
  );
});
