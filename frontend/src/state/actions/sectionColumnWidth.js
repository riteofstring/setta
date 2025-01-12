import { useReactFlow } from "forks/xyflow/core/store";
import { useCallback, useEffect, useRef } from "react";
import { useResizerStore, useSectionColumnWidth } from "state/definitions";
import { clamp } from "utils/utils";

// Constants
const CENTER_OFFSET = 18;
const BASE_MARGIN = 72;
const NESTED_MARGIN_INCREMENT = 12;
const DEFAULT_PERCENTAGE = 50;
const DOUBLE_CLICK_COUNT = 2;

// Margin calculation
const getMarginPx = (maxNestedDepth) =>
  BASE_MARGIN + Math.max(0, NESTED_MARGIN_INCREMENT * (maxNestedDepth - 1));

// Pure functions for width calculations
const calculateBoundedWidth = (width, containerWidth, maxNestedDepth) => {
  const marginPx = getMarginPx(maxNestedDepth);
  return clamp(width, marginPx, containerWidth - marginPx);
};

const calculatePercentage = (width, containerWidth) =>
  (width / containerWidth) * 100;

// State management functions
const setSectionWidth = (sectionId, rawWidth) => {
  useSectionColumnWidth.setState({
    [sectionId]: rawWidth - CENTER_OFFSET,
  });
};

const setActiveResizer = (resizerData) => {
  useResizerStore.setState({ activeResizer: resizerData });
};

const clearActiveResizer = () => {
  useResizerStore.setState({ activeResizer: null });
};

// Optimized event handlers with debouncing
const handleGlobalMouseMove = (() => {
  let rafId = null;

  return (e) => {
    const activeResizer = useResizerStore.getState().activeResizer;
    if (!activeResizer) return;

    if (rafId) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      const {
        ref,
        startX,
        startWidth,
        containerWidth,
        maxNestedDepth,
        sectionId,
        widthRef,
      } = activeResizer;

      if (!ref.current) return;

      const diff = (e.clientX - startX) / useReactFlow.getState().transform[2];
      const newWidth = startWidth + diff;
      const boundedWidth = calculateBoundedWidth(
        newWidth,
        containerWidth,
        maxNestedDepth,
      );

      setSectionWidth(sectionId, boundedWidth);
      widthRef.current.currentWidth = boundedWidth;
      rafId = null;
    });
  };
})();

const handleGlobalMouseUp = () => {
  const activeResizer = useResizerStore.getState().activeResizer;
  if (activeResizer?.widthRef) {
    const finalWidth =
      useSectionColumnWidth.getState()[activeResizer.sectionId] + CENTER_OFFSET;
    activeResizer.widthRef.current = {
      ...activeResizer.widthRef.current,
      currentPercentage: calculatePercentage(
        finalWidth,
        activeResizer.containerWidth,
      ),
      isDragging: false,
    };
  }
  clearActiveResizer();
};

// Event listener initialization for use in useEffect
export const initializeGlobalSectionColumnWidthEventListeners = () => {
  const state = useResizerStore.getState();
  if (state.globalEventListenersInitialized) return;

  window.addEventListener("mousemove", handleGlobalMouseMove, {
    passive: true,
  });
  window.addEventListener("mouseup", handleGlobalMouseUp);
  useResizerStore.setState({ globalEventListenersInitialized: true });

  return () => {
    window.removeEventListener("mousemove", handleGlobalMouseMove);
    window.removeEventListener("mouseup", handleGlobalMouseUp);
    useResizerStore.setState({ globalEventListenersInitialized: false });
  };
};

// Custom hook for column resizing
export function useColumnResizer(sectionId, ref, maxNestedDepth) {
  const widthRef = useRef({
    currentWidth: 0,
    containerWidth: 0,
    currentPercentage: DEFAULT_PERCENTAGE,
    isDragging: false,
  });

  const setNewWidth = useCallback(
    (containerWidth, width) => {
      const boundedWidth = calculateBoundedWidth(
        width,
        containerWidth,
        maxNestedDepth,
      );
      widthRef.current = {
        ...widthRef.current,
        currentWidth: boundedWidth,
        currentPercentage: calculatePercentage(boundedWidth, containerWidth),
      };
      setSectionWidth(sectionId, boundedWidth);
    },
    [sectionId, maxNestedDepth],
  );

  const updatedWidthOnContainerResize = useCallback(() => {
    if (widthRef.current.isDragging || !ref.current) return;

    const containerWidth = ref.current.clientWidth;
    const newWidth =
      (containerWidth * widthRef.current.currentPercentage) / 100;
    widthRef.current.containerWidth = containerWidth;
    setNewWidth(containerWidth, newWidth);
  }, [setNewWidth]);

  // ResizeObserver setup
  useEffect(() => {
    let previousWidth = ref.current?.clientWidth;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const newWidth =
        entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;

      if (newWidth !== previousWidth) {
        previousWidth = newWidth;
        updatedWidthOnContainerResize();
      }
    });

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return () => resizeObserver.disconnect();
  }, [updatedWidthOnContainerResize]);

  // Initial width setup
  useEffect(() => {
    if (ref.current) {
      const containerWidth = ref.current.clientWidth;
      const existingWidth = useSectionColumnWidth.getState()[sectionId];
      const initialWidth = existingWidth
        ? existingWidth + CENTER_OFFSET
        : containerWidth / 2;

      widthRef.current.containerWidth = containerWidth;
      setNewWidth(containerWidth, initialWidth);
    }
  }, [setNewWidth, sectionId]);

  // Resize handler
  return useCallback(
    (e) => {
      e.preventDefault();
      if (!ref.current) return;

      if (e.detail === DOUBLE_CLICK_COUNT) {
        const containerWidth = ref.current.clientWidth;
        widthRef.current.isDragging = false;
        widthRef.current.currentPercentage = DEFAULT_PERCENTAGE;
        setNewWidth(containerWidth, containerWidth / 2);
        return;
      }

      widthRef.current.isDragging = true;
      setActiveResizer({
        sectionId,
        ref,
        startX: e.clientX,
        startWidth: widthRef.current.currentWidth,
        containerWidth: widthRef.current.containerWidth,
        maxNestedDepth,
        widthRef,
      });
    },
    [sectionId, maxNestedDepth, setNewWidth],
  );
}
