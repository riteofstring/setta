import cc from "classcat";
import { SectionContainer } from "components/Section/Container/SectionContainer";
import { useReactFlow } from "forks/xyflow/core/store";
import type { Node, Rect } from "forks/xyflow/core/types";
import _ from "lodash";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type RefObject,
} from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useNodeInternals, useProjectState } from "state/definitions";
import {
  CANVAS_FLOW_VIEWPORT_CHANGE_EVENT,
  NO_PAN_CLASS_NAME,
} from "utils/constants";
import { shallow } from "zustand/shallow";
import { getMountedNodeIds } from "./canvasFlowGeometry";
import type {
  CanvasFlowNodeElementMap,
  CanvasFlowSize,
  CanvasFlowViewport,
} from "./canvasFlowTypes";
import {
  canvasFlowViewportsEqual,
  expandWorldRect,
  getVisibleWorldRect,
  transformToCanvasFlowViewport,
} from "./canvasFlowViewport";
import { useCanvasFlowNodeDrag } from "./useCanvasFlowNodeDrag";

const NODE_MOUNT_OVERSCAN_WORLD = 2400;
const NODE_MOUNT_REFRESH_MARGIN_WORLD = NODE_MOUNT_OVERSCAN_WORLD / 2;
const NODE_MOUNT_ZOOM_REFRESH_RATIO = 1.15;
const FALLBACK_CANVAS_CSS_SIZE = {
  cssHeight: 900,
  cssWidth: 1400,
};

type CanvasFlowMountWindow = {
  size: Pick<CanvasFlowSize, "cssHeight" | "cssWidth">;
  viewport: CanvasFlowViewport;
  visibleRect: Rect;
};

type CanvasFlowNodeLayerProps = {
  canvasCssSize: Pick<CanvasFlowSize, "cssHeight" | "cssWidth">;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  scheduleTexturePaint: () => void;
  scheduleViewportFrame: () => void;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
};

type CanvasFlowNodeWrapperProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  id: string;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  scheduleTexturePaint: () => void;
  scheduleViewportFrame: () => void;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
};

export function CanvasFlowNodeLayer({
  canvasCssSize,
  canvasRef,
  nodeElementsRef,
  resizeObserver,
  scheduleTexturePaint,
  scheduleViewportFrame,
  viewportRef,
}: CanvasFlowNodeLayerProps) {
  const nodes = useNodeInternals(
    (state) => Array.from(state.x.values()),
    shallow,
  );
  const transform = useReactFlow((state) => state.transform, shallow);
  const [mountWindow, setMountWindow] = useState(() =>
    createMountWindow(canvasCssSize, viewportRef.current),
  );

  useEffect(() => {
    const nextViewport = transformToCanvasFlowViewport(transform);
    setMountWindow((currentWindow) =>
      getNextMountWindow(currentWindow, canvasCssSize, nextViewport),
    );
  }, [canvasCssSize, transform]);

  useEffect(() => {
    let frameId: number | null = null;
    const syncMountViewport = () => {
      frameId = null;
      const nextViewport = viewportRef.current;
      setMountWindow((currentWindow) =>
        getNextMountWindow(currentWindow, canvasCssSize, nextViewport),
      );
    };
    const handleViewportChange = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(syncMountViewport);
    };
    window.addEventListener(
      CANVAS_FLOW_VIEWPORT_CHANGE_EVENT,
      handleViewportChange,
    );
    return () => {
      window.removeEventListener(
        CANVAS_FLOW_VIEWPORT_CHANGE_EVENT,
        handleViewportChange,
      );
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [canvasCssSize, viewportRef]);

  const nodeIds = useMemo(() => {
    return getMountedNodeIds({
      nodes,
      visibleRect: mountWindow.visibleRect,
    });
  }, [mountWindow, nodes]);

  useEffect(() => {
    scheduleTexturePaint();
  }, [nodeIds, scheduleTexturePaint]);

  return (
    <>
      {nodeIds.map((nodeId) => (
        <CanvasFlowNodeWrapper
          canvasRef={canvasRef}
          key={nodeId}
          id={nodeId}
          nodeElementsRef={nodeElementsRef}
          resizeObserver={resizeObserver}
          scheduleTexturePaint={scheduleTexturePaint}
          scheduleViewportFrame={scheduleViewportFrame}
          viewportRef={viewportRef}
        />
      ))}
    </>
  );
}

function createMountWindow(
  canvasCssSize: Pick<CanvasFlowSize, "cssHeight" | "cssWidth">,
  viewport: CanvasFlowViewport,
): CanvasFlowMountWindow {
  const size = getEffectiveCanvasCssSize(canvasCssSize);
  return {
    size,
    viewport: { ...viewport },
    visibleRect: expandWorldRect(
      getVisibleWorldRect(size, viewport),
      NODE_MOUNT_OVERSCAN_WORLD,
    ),
  };
}

function getNextMountWindow(
  currentWindow: CanvasFlowMountWindow,
  canvasCssSize: Pick<CanvasFlowSize, "cssHeight" | "cssWidth">,
  viewport: CanvasFlowViewport,
): CanvasFlowMountWindow {
  const size = getEffectiveCanvasCssSize(canvasCssSize);
  if (
    currentWindow.size.cssHeight !== size.cssHeight ||
    currentWindow.size.cssWidth !== size.cssWidth
  ) {
    return createMountWindow(size, viewport);
  }
  if (shouldReuseMountWindow(currentWindow, size, viewport)) {
    return currentWindow;
  }
  return createMountWindow(size, viewport);
}

function shouldReuseMountWindow(
  currentWindow: CanvasFlowMountWindow,
  size: Pick<CanvasFlowSize, "cssHeight" | "cssWidth">,
  viewport: CanvasFlowViewport,
) {
  if (canvasFlowViewportsEqual(currentWindow.viewport, viewport)) {
    return true;
  }
  const zoomRatio = Math.max(
    viewport.zoom / currentWindow.viewport.zoom,
    currentWindow.viewport.zoom / viewport.zoom,
  );
  if (zoomRatio >= NODE_MOUNT_ZOOM_REFRESH_RATIO) {
    return false;
  }
  return containsRect(
    shrinkWorldRect(currentWindow.visibleRect, NODE_MOUNT_REFRESH_MARGIN_WORLD),
    getVisibleWorldRect(size, viewport),
  );
}

function containsRect(outer: Rect, inner: Rect) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function shrinkWorldRect(rect: Rect, margin: number): Rect {
  return {
    x: rect.x + margin,
    y: rect.y + margin,
    width: Math.max(rect.width - margin * 2, 0),
    height: Math.max(rect.height - margin * 2, 0),
  };
}

function getEffectiveCanvasCssSize(
  size: Pick<CanvasFlowSize, "cssHeight" | "cssWidth">,
) {
  if (size.cssWidth > 0 && size.cssHeight > 0) {
    return size;
  }
  if (typeof window !== "undefined") {
    return {
      cssHeight: window.innerHeight || FALLBACK_CANVAS_CSS_SIZE.cssHeight,
      cssWidth: window.innerWidth || FALLBACK_CANVAS_CSS_SIZE.cssWidth,
    };
  }
  return FALLBACK_CANVAS_CSS_SIZE;
}

function _CanvasFlowNodeWrapper({
  canvasRef,
  id,
  nodeElementsRef,
  resizeObserver,
  scheduleTexturePaint,
  scheduleViewportFrame,
  viewportRef,
}: CanvasFlowNodeWrapperProps) {
  const node = useNodeInternals((state) => state.x.get(id), _.isEqual);
  const panActivationKeyPressed = useReactFlow((state) =>
    Boolean(
      (state as { panActivationKeyPressed?: boolean }).panActivationKeyPressed,
    ),
  );
  const positionAndSizeLocked = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, id);
    return impl.positionAndSizeLocked;
  });
  const nodeRef = useRef<HTMLDivElement>(null);
  const observedElementRef = useRef<HTMLDivElement | null>(null);
  const isDraggable = !panActivationKeyPressed && !positionAndSizeLocked;
  const dragHandlers = useCanvasFlowNodeDrag({
    canvasRef,
    disabled: !isDraggable,
    nodeId: id,
    nodeRef,
    schedulePaint: scheduleViewportFrame,
    viewportRef,
  });

  const setNodeRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (observedElementRef.current) {
        resizeObserver?.unobserve(observedElementRef.current);
        nodeElementsRef.current.delete(id);
      }
      nodeRef.current = element;
      observedElementRef.current = element;
      if (element) {
        nodeElementsRef.current.set(id, element);
        resizeObserver?.observe(element);
      }
      scheduleTexturePaint();
    },
    [id, nodeElementsRef, resizeObserver, scheduleTexturePaint],
  );

  useEffect(() => {
    return () => {
      const element = observedElementRef.current;
      if (element) {
        resizeObserver?.unobserve(element);
      }
      nodeElementsRef.current.delete(id);
      scheduleTexturePaint();
    };
  }, [id, nodeElementsRef, resizeObserver, scheduleTexturePaint]);

  useEffect(() => {
    scheduleTexturePaint();
  }, [node?.height, node?.width, scheduleTexturePaint]);

  useEffect(() => {
    scheduleViewportFrame();
  }, [
    node?.position.x,
    node?.position.y,
    node?.tempZIndex,
    scheduleViewportFrame,
  ]);

  if (!node) {
    return null;
  }

  return (
    <div
      {...dragHandlers}
      className={cc([
        "canvas-flow__node",
        {
          [NO_PAN_CLASS_NAME]: isDraggable,
        },
      ])}
      data-id={id}
      data-testid={`rf__node-${id}`}
      ref={setNodeRef}
      style={getNodeStyle(node)}
    >
      <SectionContainer sectionId={id} isTopLevel={true} />
    </div>
  );
}

function getNodeStyle(node: Node): CSSProperties {
  return {
    height: node.height ?? undefined,
    left: 0,
    pointerEvents: "auto",
    position: "absolute",
    top: 0,
    transformOrigin: "0 0",
    width: node.width ?? undefined,
    zIndex: node.tempZIndex,
  };
}

const CanvasFlowNodeWrapper = memo(_CanvasFlowNodeWrapper);

export default memo(CanvasFlowNodeLayer);
