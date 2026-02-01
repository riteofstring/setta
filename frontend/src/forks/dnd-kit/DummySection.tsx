import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useDndState } from "forks/dnd-kit/dndState";
import _ from "lodash";
import { forwardRef } from "react";
import { createPortal } from "react-dom";
import { TbDragDrop } from "react-icons/tb";

export const TempDNDSection = forwardRef<HTMLDivElement, Record<string, never>>(
  ({}, ref) => {
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

type OverlayRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function resolveOverlayRect(
  draggingRectsById: Record<
    string,
    {
      top: number;
      left: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    }
  > | null,
  fallbackRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null,
): OverlayRect | null {
  if (draggingRectsById) {
    const rects = Object.values(draggingRectsById);
    if (rects.length > 0) {
      let left = rects[0].left;
      let top = rects[0].top;
      let right = rects[0].right;
      let bottom = rects[0].bottom;
      for (const rect of rects.slice(1)) {
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      }
      return {
        left,
        top,
        width: right - left,
        height: bottom - top,
      };
    }
  }

  if (fallbackRect) {
    return {
      left: fallbackRect.left,
      top: fallbackRect.top,
      width: fallbackRect.width,
      height: fallbackRect.height,
    };
  }

  return null;
}

export const DummyDragOverlay = forwardRef<
  HTMLDivElement,
  Record<string, never>
>(({}, ref) => {
  const manager = useDragDropManager();
  const { draggingRectsById, activeRect, draggingIds } = useDndState(
    (state) => ({
      draggingRectsById: state.draggingRectsById,
      activeRect: state.activeRect,
      draggingIds: state.draggingIds,
    }),
    _.isEqual,
  );
  const isDropped = useComputed(
    () => manager?.dragOperation.status.dropped ?? false,
    [manager],
  ).value;
  const isDragging = useComputed(
    () => manager?.dragOperation.status.dragging ?? false,
    [manager],
  ).value;
  const shouldRenderOverlay = useComputed(
    () => manager?.dragOperation.status.initialized ?? false,
    [manager],
  ).value;
  const dragTransform = useComputed(() => {
    if (!manager) {
      return null;
    }
    const transform = manager.dragOperation.transform;
    return {
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
    };
  }, [manager]).value;

  if (!shouldRenderOverlay || isDropped) {
    return null;
  }

  if (!isDragging) {
    return null;
  }

  const overlayRectBase = resolveOverlayRect(draggingRectsById, activeRect);
  if (!overlayRectBase) {
    return null;
  }
  const overlayRect = {
    top: overlayRectBase.top + (dragTransform?.y ?? 0),
    left: overlayRectBase.left + (dragTransform?.x ?? 0),
    width: overlayRectBase.width,
    height: overlayRectBase.height,
  };

  const overlayClassName =
    draggingIds.length > 1
      ? "rounded-xl border-2 border-blue-400/70 bg-blue-500/20 shadow-lg dark:border-blue-400/60 dark:bg-blue-700/20"
      : "rounded-xl bg-blue-500/90 shadow-lg dark:bg-blue-700/90";

  return createPortal(
    <div
      className={overlayClassName}
      style={{
        position: "fixed",
        top: overlayRect.top,
        left: overlayRect.left,
        width: overlayRect.width,
        height: overlayRect.height,
        pointerEvents: "none",
        zIndex: 1000,
      }}
      ref={ref}
    />,
    document.body,
  );
});
