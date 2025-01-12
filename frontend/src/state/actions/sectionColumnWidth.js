import { useReactFlow } from "forks/xyflow/core/store";
import { useCallback, useEffect, useRef } from "react";
import { useResizerStore, useSectionColumnWidth } from "state/definitions";
import { clamp } from "utils/utils";

export const CENTER_OFFSET = 18;

export function getMarginPx(maxNestedDepth) {
  return 72 + Math.max(0, 12 * (maxNestedDepth - 1));
}

export function calculateBoundedWidth(width, containerWidth, maxNestedDepth) {
  const marginPx = getMarginPx(maxNestedDepth);
  return clamp(width, marginPx, containerWidth - marginPx);
}

export function setSectionWidth(sectionId, rawWidth) {
  useSectionColumnWidth.setState({
    [sectionId]: rawWidth - CENTER_OFFSET,
  });
}

export function setActiveResizer(resizerData) {
  useResizerStore.setState({ activeResizer: resizerData });
}

export function clearActiveResizer() {
  useResizerStore.setState({ activeResizer: null });
}

export function handleGlobalMouseMove(e) {
  const activeResizer = useResizerStore.getState().activeResizer;
  if (!activeResizer) return;

  if (activeResizer.rafId) {
    cancelAnimationFrame(activeResizer.rafId);
  }

  activeResizer.rafId = requestAnimationFrame(() => {
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

    delete activeResizer.rafId;
  });
}

export function handleGlobalMouseUp() {
  const activeResizer = useResizerStore.getState().activeResizer;
  if (activeResizer?.widthRef) {
    const finalWidth =
      useSectionColumnWidth.getState()[activeResizer.sectionId] + CENTER_OFFSET;
    const percentage = (finalWidth / activeResizer.containerWidth) * 100;
    activeResizer.widthRef.current.currentPercentage = percentage;
    activeResizer.widthRef.current.isDragging = false;
  }
  clearActiveResizer();
}

export function initializeGlobalSectionColumnWidthEventListeners() {
  const state = useResizerStore.getState();
  if (state.globalEventListenersInitialized) return;

  window.addEventListener("mousemove", handleGlobalMouseMove);
  window.addEventListener("mouseup", handleGlobalMouseUp);

  useResizerStore.setState({ globalEventListenersInitialized: true });

  return () => {
    window.removeEventListener("mousemove", handleGlobalMouseMove);
    window.removeEventListener("mouseup", handleGlobalMouseUp);
  };
}

export function useColumnResizer(sectionId, ref, maxNestedDepth) {
  const widthRef = useRef({
    currentWidth: 0,
    containerWidth: 0,
    currentPercentage: 50,
    isDragging: false,
  });

  function setNewWidth(containerWidth, width) {
    const boundedWidth = calculateBoundedWidth(
      width,
      containerWidth,
      maxNestedDepth,
    );
    widthRef.current.currentWidth = boundedWidth;
    widthRef.current.currentPercentage = (boundedWidth / containerWidth) * 100;
    setSectionWidth(sectionId, boundedWidth);
    console.log("setNewWidth")
  }

  function updatedWidthOnContainerResize() {
    if (widthRef.current.isDragging || !ref.current) return;

    const containerWidth = ref.current.clientWidth;
    const currentPercentage = widthRef.current.currentPercentage;
    const newWidth = (containerWidth * currentPercentage) / 100;
    widthRef.current.containerWidth = containerWidth;
    setNewWidth(containerWidth, newWidth);
    console.log("updatedWidthOnContainerResize")
  }

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

    console.log("resizeObserver useEffect")

    return () => {
      resizeObserver.disconnect();
    };
  }, [maxNestedDepth]);

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
    console.log("container width useEffect")
  }, [maxNestedDepth]);

  const handleResizeStart = useCallback(
    (e) => {
      console.log("handleResizeStart")
      e.preventDefault();
      if (ref.current) {
        if (e.detail === 2) {
          // Double click
          const containerWidth = ref.current.clientWidth;
          widthRef.current.isDragging = false;
          widthRef.current.currentPercentage = 50;
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
      }
    },
    [sectionId, maxNestedDepth],
  );

  return handleResizeStart;
}
