import { getZoom } from "gpuFlow/viewportActions";
import {
  useCallback,
  useEffect,
  useRef,
  type MouseEventHandler,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  calculateBoundedWidth,
  getDefaultColumnWidth,
} from "state/hooks/columnWidthUtils";

type DragListeners = {
  move: ((event: MouseEvent) => void) | null;
  up: (() => void) | null;
};

type ColumnWidthState = {
  currentWidth: number;
  containerWidth: number;
  currentPercentage: number;
  isDragging: boolean;
};

type UseColumnWidthDragArgs = {
  outerRef: RefObject<HTMLDivElement>;
  maxNestedDepthRef: MutableRefObject<number>;
  applyWidth: (width: number) => void;
  persistWidth: (width: number) => void;
  getBoundedWidth?: (width: number, containerWidth: number) => number;
};

type UseColumnWidthDragResult = {
  handleResizeStart: MouseEventHandler<HTMLDivElement>;
  setNewWidth: (containerWidth: number, rawWidth: number) => void;
  widthRef: MutableRefObject<ColumnWidthState>;
};

export function useColumnWidthDrag({
  outerRef,
  maxNestedDepthRef,
  applyWidth,
  persistWidth,
  getBoundedWidth: getBoundedWidthOverride,
}: UseColumnWidthDragArgs): UseColumnWidthDragResult {
  const widthRef = useRef<ColumnWidthState>({
    currentWidth: 0,
    containerWidth: 0,
    currentPercentage: 50,
    isDragging: false,
  });
  const rafRef = useRef<number | null>(null);
  const dragListenersRef = useRef<DragListeners>({ move: null, up: null });

  const defaultGetBoundedWidth = useCallback(
    (rawWidth: number, containerWidth: number) =>
      calculateBoundedWidth(
        rawWidth,
        containerWidth,
        maxNestedDepthRef.current,
      ),
    [maxNestedDepthRef],
  );
  const getBoundedWidth = getBoundedWidthOverride ?? defaultGetBoundedWidth;

  const setNewWidth = useCallback(
    (containerWidth: number, rawWidth: number) => {
      if (!containerWidth) {
        return;
      }
      const boundedWidth = getBoundedWidth(rawWidth, containerWidth);
      widthRef.current.currentWidth = boundedWidth;
      widthRef.current.containerWidth = containerWidth;
      widthRef.current.currentPercentage =
        (boundedWidth / containerWidth) * 100;
      applyWidth(boundedWidth);
    },
    [applyWidth, getBoundedWidth],
  );

  const updateWidthOnContainerResize = useCallback(() => {
    if (widthRef.current.isDragging || !outerRef.current) {
      return;
    }
    const containerWidth = outerRef.current.clientWidth;
    if (!containerWidth) {
      return;
    }
    const newWidth =
      (containerWidth * widthRef.current.currentPercentage) / 100;
    setNewWidth(containerWidth, newWidth);
  }, [outerRef, setNewWidth]);

  useEffect(() => {
    let previousWidth = outerRef.current?.clientWidth;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const newWidth =
        entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;

      if (newWidth !== previousWidth) {
        previousWidth = newWidth;
        updateWidthOnContainerResize();
      }
    });

    if (outerRef.current) {
      resizeObserver.observe(outerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [outerRef, updateWidthOnContainerResize]);

  useEffect(() => {
    return () => {
      if (dragListenersRef.current.move) {
        window.removeEventListener("mousemove", dragListenersRef.current.move);
      }
      if (dragListenersRef.current.up) {
        window.removeEventListener("mouseup", dragListenersRef.current.up);
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleResizeStart: MouseEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      event.preventDefault();
      const container = outerRef.current;
      if (!container) {
        return;
      }
      const containerWidth = container.clientWidth;
      if (!containerWidth) {
        return;
      }
      widthRef.current.containerWidth = containerWidth;

      if (widthRef.current.currentWidth === 0) {
        setNewWidth(containerWidth, getDefaultColumnWidth(containerWidth));
      }

      if (event.detail === 2) {
        widthRef.current.isDragging = false;
        const rawWidth = getDefaultColumnWidth(containerWidth);
        setNewWidth(containerWidth, rawWidth);
        persistWidth(rawWidth);
        return;
      }

      const startX = event.clientX;
      const startWidth = widthRef.current.currentWidth;
      widthRef.current.isDragging = true;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = requestAnimationFrame(() => {
          const scale = getZoom();
          const delta = (moveEvent.clientX - startX) / scale;
          const newWidth = startWidth + delta;
          const boundedWidth = getBoundedWidth(newWidth, containerWidth);
          widthRef.current.currentWidth = boundedWidth;
          applyWidth(boundedWidth);
          rafRef.current = null;
        });
      };

      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        dragListenersRef.current = { move: null, up: null };

        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        const finalWidth = widthRef.current.currentWidth;
        if (widthRef.current.containerWidth) {
          widthRef.current.currentPercentage =
            (finalWidth / widthRef.current.containerWidth) * 100;
        }
        widthRef.current.isDragging = false;
        persistWidth(finalWidth);
      };

      dragListenersRef.current = { move: handleMouseMove, up: handleMouseUp };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [applyWidth, getBoundedWidth, outerRef, persistWidth, setNewWidth],
  );

  return { handleResizeStart, setNewWidth, widthRef };
}
