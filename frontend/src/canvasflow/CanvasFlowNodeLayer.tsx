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
  type PointerEvent,
  type RefObject,
} from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useActiveSectionUI } from "state/activeSectionUI";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import {
  CANVAS_FLOW_VIEWPORT_CHANGE_EVENT,
  NO_PAN_CLASS_NAME,
  getSectionStylePreviewColorKey,
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

type ScheduleCanvasFlowTexturePaint = (
  reason?: string,
  nodeIds?: ReadonlySet<string> | "all",
) => void;
type ScheduleCanvasFlowLiveTextureRefresh = (
  reason: string,
  nodeIds: ReadonlySet<string>,
  durationMs?: number,
) => void;
type ScheduleCanvasFlowViewportFrame = (reason?: string) => void;

type CanvasFlowNodeLayerProps = {
  canvasCssSize: Pick<CanvasFlowSize, "cssHeight" | "cssWidth">;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  scheduleLiveTextureRefresh: ScheduleCanvasFlowLiveTextureRefresh;
  scheduleTexturePaint: ScheduleCanvasFlowTexturePaint;
  scheduleViewportFrame: ScheduleCanvasFlowViewportFrame;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
};

type CanvasFlowNodeWrapperProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  id: string;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  scheduleLiveTextureRefresh: ScheduleCanvasFlowLiveTextureRefresh;
  scheduleTexturePaint: ScheduleCanvasFlowTexturePaint;
  scheduleViewportFrame: ScheduleCanvasFlowViewportFrame;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
};

export function CanvasFlowNodeLayer({
  canvasCssSize,
  canvasRef,
  nodeElementsRef,
  resizeObserver,
  scheduleLiveTextureRefresh,
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
  const previousMountedNodeIdsRef = useRef<Set<string>>(new Set());

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
    const previousNodeIds = previousMountedNodeIdsRef.current;
    const nextNodeIds = new Set(nodeIds);
    const addedNodeIds = getAddedNodeIds(previousNodeIds, nextNodeIds);
    previousMountedNodeIdsRef.current = nextNodeIds;
    if (addedNodeIds.size > 0) {
      scheduleTexturePaint("node-mount", addedNodeIds);
      return;
    }
    scheduleViewportFrame("node-mount-window");
  }, [nodeIds, scheduleTexturePaint, scheduleViewportFrame]);

  return (
    <>
      {nodeIds.map((nodeId) => (
        <CanvasFlowNodeWrapper
          canvasRef={canvasRef}
          key={nodeId}
          id={nodeId}
          nodeElementsRef={nodeElementsRef}
          resizeObserver={resizeObserver}
          scheduleLiveTextureRefresh={scheduleLiveTextureRefresh}
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

function getAddedNodeIds(
  previousNodeIds: ReadonlySet<string>,
  nextNodeIds: ReadonlySet<string>,
) {
  const addedNodeIds = new Set<string>();
  for (const nodeId of nextNodeIds) {
    if (!previousNodeIds.has(nodeId)) {
      addedNodeIds.add(nodeId);
    }
  }
  return addedNodeIds;
}

function _CanvasFlowNodeWrapper({
  canvasRef,
  id,
  nodeElementsRef,
  resizeObserver,
  scheduleLiveTextureRefresh,
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
  const { positionAndSizeLocked, styleColor } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, id);
    return {
      positionAndSizeLocked: impl.positionAndSizeLocked,
      styleColor: impl.styleColor ?? null,
    };
  }, _.isEqual);
  const styleColorPreviewKey = useMemo(
    () => getSectionStylePreviewColorKey(id),
    [id],
  );
  const styleColorPreview = useLocalStorage(
    (state) => state[styleColorPreviewKey] as string | null | undefined,
  );
  const isActiveSection = useActiveSectionUI((state) =>
    state.activeIds.includes(id),
  );
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
        scheduleTexturePaint("node-ref", new Set([id]));
        return;
      }
      scheduleViewportFrame("node-ref-cleared");
    },
    [
      id,
      nodeElementsRef,
      resizeObserver,
      scheduleTexturePaint,
      scheduleViewportFrame,
    ],
  );

  useEffect(() => {
    return () => {
      const element = observedElementRef.current;
      if (element) {
        resizeObserver?.unobserve(element);
      }
      nodeElementsRef.current.delete(id);
      scheduleViewportFrame("node-unmount");
    };
  }, [id, nodeElementsRef, resizeObserver, scheduleViewportFrame]);

  useEffect(() => {
    scheduleTexturePaint("node-size", new Set([id]));
  }, [id, node?.height, node?.width, scheduleTexturePaint]);

  useEffect(() => {
    scheduleTexturePaint("node-selection", new Set([id]));
  }, [id, isActiveSection, scheduleTexturePaint]);

  useEffect(() => {
    scheduleTexturePaint("node-section-style", new Set([id]));
  }, [
    id,
    scheduleTexturePaint,
    styleColor,
    styleColorPreview,
    styleColorPreviewKey,
  ]);

  useEffect(() => {
    scheduleViewportFrame();
  }, [
    node?.position.x,
    node?.position.y,
    node?.tempZIndex,
    scheduleViewportFrame,
  ]);

  const scheduleNodeSourcePaint = useCallback(
    (reason: string) => {
      scheduleLiveTextureRefresh(reason, new Set([id]));
    },
    [id, scheduleLiveTextureRefresh],
  );
  const handlePointerOverCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (isRelatedTargetInside(event.currentTarget, event.relatedTarget)) {
        return;
      }
      scheduleNodeSourcePaint("node-hover");
    },
    [scheduleNodeSourcePaint],
  );
  const handlePointerOutCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (isRelatedTargetInside(event.currentTarget, event.relatedTarget)) {
        return;
      }
      scheduleNodeSourcePaint("node-hover");
    },
    [scheduleNodeSourcePaint],
  );

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
      onBlurCapture={() => scheduleNodeSourcePaint("node-focus")}
      onChangeCapture={() => scheduleNodeSourcePaint("node-change")}
      onClickCapture={() => scheduleNodeSourcePaint("node-click")}
      onFocusCapture={() => scheduleNodeSourcePaint("node-focus")}
      onInputCapture={() => scheduleNodeSourcePaint("node-input")}
      onPointerOutCapture={handlePointerOutCapture}
      onPointerOverCapture={handlePointerOverCapture}
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

function isRelatedTargetInside(
  currentTarget: HTMLElement,
  relatedTarget: EventTarget | null,
) {
  return (
    relatedTarget instanceof globalThis.Node &&
    currentTarget.contains(relatedTarget)
  );
}

const CanvasFlowNodeWrapper = memo(_CanvasFlowNodeWrapper);

export default memo(CanvasFlowNodeLayer);
