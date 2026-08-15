import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type RefObject,
} from "react";
import { useReactFlow } from "../canvas/store";
import { getSectionItemTreeOrThrow } from "../document/documentSelectors";
import { setItemColumnWidth } from "../document/itemColumnWidth";
import { useWorkspaceDocument } from "../document/stores";
import { getInlineDirectionSign } from "../styles/textDirection";
import {
  calculateBoundedItemColumnWidth,
  getDeepestItemDepth,
  getDefaultItemColumnWidth,
  getItemColumnCssWidth,
  ITEM_COLUMN_CENTER_OFFSET_PX,
} from "./itemColumnWidth";

type DragListeners = {
  move: ((event: PointerEvent) => void) | null;
  finish: ((event: PointerEvent) => void) | null;
};

type ItemColumnWidthState = {
  currentWidth: number;
  containerWidth: number;
  currentPercentage: number;
  isDragging: boolean;
};

type ItemColumnResizeHandlers = {
  onColumnResizeStart: PointerEventHandler<HTMLButtonElement>;
  onColumnResizeKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onColumnResizeClick: MouseEventHandler<HTMLButtonElement>;
  onColumnResizeDoubleClick: MouseEventHandler<HTMLButtonElement>;
};

function getStyleTarget(outer: HTMLDivElement, sectionId: string): HTMLElement {
  const sectionSurface = outer.closest<HTMLElement>("[data-section-id]");
  if (sectionSurface && sectionSurface.dataset.sectionId !== sectionId) {
    throw new Error(
      `Item list for section ${sectionId} mounted inside section ${String(sectionSurface.dataset.sectionId)}.`,
    );
  }
  // A normal canvas mount writes the shared variable on the enclosing section so every mounted
  // list updates live. Standalone component tests/consumers without a section shell use the list
  // outer itself, preserving the same inherited CSS contract.
  return sectionSurface ?? outer;
}

export function useItemColumnWidth(
  sectionId: string,
  outerRef: RefObject<HTMLDivElement | null>,
): ItemColumnResizeHandlers {
  const persistedColumnWidth = useWorkspaceDocument(
    (state) => getSectionItemTreeOrThrow(state, sectionId).itemColumnWidth ?? null,
  );
  const maxNestedDepth = useWorkspaceDocument((state) =>
    getDeepestItemDepth(getSectionItemTreeOrThrow(state, sectionId)),
  );
  const maxNestedDepthRef = useRef(maxNestedDepth);
  const widthRef = useRef<ItemColumnWidthState>({
    currentWidth: 0,
    containerWidth: 0,
    currentPercentage: 50,
    isDragging: false,
  });
  const animationFrameRef = useRef<number | null>(null);
  const dragListenersRef = useRef<DragListeners>({ move: null, finish: null });

  const applyWidth = useCallback(
    (rawWidth: number) => {
      const outer = outerRef.current;
      if (!outer) {
        return;
      }
      getStyleTarget(outer, sectionId).style.setProperty(
        "--param-column-width",
        `${getItemColumnCssWidth(rawWidth)}px`,
      );
    },
    [outerRef, sectionId],
  );

  const getBoundedWidth = useCallback(
    (rawWidth: number, containerWidth: number) =>
      calculateBoundedItemColumnWidth(rawWidth, containerWidth, maxNestedDepthRef.current),
    [maxNestedDepthRef],
  );

  const setNewWidth = useCallback(
    (containerWidth: number, rawWidth: number) => {
      if (!containerWidth) {
        return;
      }
      const boundedWidth = getBoundedWidth(rawWidth, containerWidth);
      widthRef.current.currentWidth = boundedWidth;
      widthRef.current.containerWidth = containerWidth;
      widthRef.current.currentPercentage = (boundedWidth / containerWidth) * 100;
      applyWidth(boundedWidth);
    },
    [applyWidth, getBoundedWidth],
  );

  const updateWidthOnContainerResize = useCallback(() => {
    const outer = outerRef.current;
    if (widthRef.current.isDragging || !outer) {
      return;
    }
    const containerWidth = outer.clientWidth;
    if (!containerWidth) {
      return;
    }
    const nextWidth = (containerWidth * widthRef.current.currentPercentage) / 100;
    setNewWidth(containerWidth, nextWidth);
  }, [outerRef, setNewWidth]);

  useEffect(() => {
    maxNestedDepthRef.current = maxNestedDepth;
    const outer = outerRef.current;
    if (!outer || widthRef.current.currentWidth === 0) {
      return;
    }
    const containerWidth = outer.clientWidth;
    if (!containerWidth) {
      return;
    }
    setNewWidth(containerWidth, widthRef.current.currentWidth);
  }, [maxNestedDepth, outerRef, setNewWidth]);

  useEffect(() => {
    const outer = outerRef.current;
    if (widthRef.current.isDragging || !outer) {
      return;
    }
    const containerWidth = outer.clientWidth;
    if (!containerWidth) {
      return;
    }
    const rawWidth =
      persistedColumnWidth === null
        ? getDefaultItemColumnWidth(containerWidth)
        : persistedColumnWidth + ITEM_COLUMN_CENTER_OFFSET_PX;
    setNewWidth(containerWidth, rawWidth);
  }, [outerRef, persistedColumnWidth, setNewWidth]);

  useEffect(() => {
    const outer = outerRef.current;
    let previousWidth = outer?.clientWidth;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const nextWidth = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
      if (nextWidth !== previousWidth) {
        previousWidth = nextWidth;
        updateWidthOnContainerResize();
      }
    });
    if (outer) {
      resizeObserver.observe(outer);
    }
    return () => resizeObserver.disconnect();
  }, [outerRef, updateWidthOnContainerResize]);

  useEffect(() => {
    return () => {
      if (dragListenersRef.current.move) {
        window.removeEventListener("pointermove", dragListenersRef.current.move);
      }
      if (dragListenersRef.current.finish) {
        window.removeEventListener("pointerup", dragListenersRef.current.finish);
        window.removeEventListener("pointercancel", dragListenersRef.current.finish);
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const resetWidth = useCallback(() => {
    const containerWidth = outerRef.current?.clientWidth ?? 0;
    if (!containerWidth) {
      return;
    }
    widthRef.current.isDragging = false;
    const rawWidth = getDefaultItemColumnWidth(containerWidth);
    setNewWidth(containerWidth, rawWidth);
    setItemColumnWidth(sectionId, getItemColumnCssWidth(rawWidth));
  }, [outerRef, sectionId, setNewWidth]);

  const onColumnResizeStart = useCallback<PointerEventHandler<HTMLButtonElement>>(
    (event) => {
      event.preventDefault();
      const outer = outerRef.current;
      if (!outer) {
        return;
      }
      const containerWidth = outer.clientWidth;
      if (!containerWidth) {
        return;
      }
      widthRef.current.containerWidth = containerWidth;

      if (widthRef.current.currentWidth === 0) {
        setNewWidth(containerWidth, getDefaultItemColumnWidth(containerWidth));
      }

      const startX = event.clientX;
      const startWidth = widthRef.current.currentWidth;
      const pointerId = event.pointerId;
      const inlineDirectionSign = getInlineDirectionSign(event.currentTarget);
      let pendingClientX: number | null = null;
      widthRef.current.isDragging = true;

      const applyPointerClientX = (clientX: number) => {
        const scale = useReactFlow.getState().transform[2];
        const delta = ((clientX - startX) / scale) * inlineDirectionSign;
        const nextWidth = getBoundedWidth(startWidth + delta, containerWidth);
        widthRef.current.currentWidth = nextWidth;
        applyWidth(nextWidth);
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        pendingClientX = moveEvent.clientX;
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = requestAnimationFrame(() => {
          if (pendingClientX !== null) {
            applyPointerClientX(pendingClientX);
            pendingClientX = null;
          }
          animationFrameRef.current = null;
        });
      };

      const handlePointerFinish = (finishEvent: PointerEvent) => {
        if (finishEvent.pointerId !== pointerId) {
          return;
        }
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerFinish);
        window.removeEventListener("pointercancel", handlePointerFinish);
        dragListenersRef.current = { move: null, finish: null };
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (finishEvent.type === "pointercancel") {
          pendingClientX = null;
          widthRef.current.currentWidth = startWidth;
          widthRef.current.isDragging = false;
          applyWidth(startWidth);
          return;
        }
        if (pendingClientX !== null) {
          applyPointerClientX(pendingClientX);
          pendingClientX = null;
        }
        const finalWidth = widthRef.current.currentWidth;
        if (widthRef.current.containerWidth) {
          widthRef.current.currentPercentage = (finalWidth / widthRef.current.containerWidth) * 100;
        }
        widthRef.current.isDragging = false;
        setItemColumnWidth(sectionId, getItemColumnCssWidth(finalWidth));
      };

      dragListenersRef.current = { move: handlePointerMove, finish: handlePointerFinish };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerFinish);
      window.addEventListener("pointercancel", handlePointerFinish);
    },
    [applyWidth, getBoundedWidth, outerRef, sectionId, setNewWidth],
  );

  const onColumnResizeKeyDown = useCallback<KeyboardEventHandler<HTMLButtonElement>>(
    (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const containerWidth = outerRef.current?.clientWidth ?? 0;
      if (!containerWidth) {
        return;
      }
      const currentWidth =
        widthRef.current.currentWidth || getDefaultItemColumnWidth(containerWidth);
      const direction =
        (event.key === "ArrowLeft" ? -1 : 1) * getInlineDirectionSign(event.currentTarget);
      const increment = event.shiftKey ? 1 : 10;
      setNewWidth(containerWidth, currentWidth + direction * increment);
      setItemColumnWidth(sectionId, getItemColumnCssWidth(widthRef.current.currentWidth));
    },
    [outerRef, sectionId, setNewWidth],
  );

  const onColumnResizeClick = useCallback<MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      // Native keyboard activation emits a detail-zero click. Pointer clicks remain drag starts;
      // Chrome reports their double activation through the dedicated `dblclick` event below.
      if (event.detail === 0) {
        event.preventDefault();
        event.stopPropagation();
        resetWidth();
      }
    },
    [resetWidth],
  );

  const onColumnResizeDoubleClick = useCallback<MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetWidth();
    },
    [resetWidth],
  );

  return {
    onColumnResizeStart,
    onColumnResizeKeyDown,
    onColumnResizeClick,
    onColumnResizeDoubleClick,
  };
}
