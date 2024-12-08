import { useReactFlow } from "forks/xyflow/core/store";
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
