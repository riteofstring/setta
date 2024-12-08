import { useReactFlow } from "forks/xyflow/core/store";
import { useResizerStore, useSectionColumnWidth } from "state/definitions";
import { clamp } from "utils/utils";

export function setActiveResizer(resizerData) {
  useResizerStore.setState({ activeResizer: resizerData });
}

export function clearActiveResizer() {
  useResizerStore.setState({ activeResizer: null });
}

export function handleGlobalMouseMove(e) {
  const activeResizer = useResizerStore.getState().activeResizer;
  if (!activeResizer) return;

  // Cancel any existing RAF to prevent frame queue buildup
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
    } = activeResizer;
    if (!ref.current) return;

    const marginPx = 72 + Math.max(0, 12 * (maxNestedDepth - 1));
    const centerOffset = 18;
    const diff = (e.clientX - startX) / useReactFlow.getState().transform[2];
    const newWidth = startWidth + diff;

    const boundedWidth = clamp(newWidth, marginPx, containerWidth - marginPx);
    useSectionColumnWidth.setState({
      [sectionId]: boundedWidth - centerOffset,
    });

    // Update the dragging state in the ref
    if (ref.current._widthRef) {
      ref.current._widthRef.current.currentWidth = boundedWidth;
    }

    delete activeResizer.rafId;
  });
}

export function handleGlobalMouseUp() {
  const activeResizer = useResizerStore.getState().activeResizer;
  if (activeResizer?.ref.current?._widthRef) {
    const widthRef = activeResizer.ref.current._widthRef;
    // Update percentage after drag ends
    const finalWidth =
      useSectionColumnWidth.getState()[activeResizer.sectionId] + 18; // Add centerOffset back
    const percentage = (finalWidth / activeResizer.containerWidth) * 100;
    widthRef.current.currentPercentage = percentage;
    widthRef.current.isDragging = false;
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
