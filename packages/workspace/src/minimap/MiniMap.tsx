import cc from "classcat";
import {
  memo,
  useEffect,
  useRef,
  type KeyboardEventHandler,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { shallow } from "zustand/shallow";
import Panel from "../canvas/Panel.js";
import { getNodesBounds, getPaneRect } from "../canvas/graph.js";
import { getReactFlowStore, useReactFlow } from "../canvas/store.js";
import type {
  CoordinateExtent,
  ReactFlowState,
  Rect,
} from "../canvas/types.js";
import { getBoundsOfRects } from "../canvas/utils.js";
import { getWorkspaceXyflowRuntime } from "../canvas/xyflow/workspaceXyflowRuntime.js";
import type { WorkspaceXyflowViewport } from "../canvas/xyflow/types.js";
import {
  getActiveSectionsStore,
  useNodeInternals,
  type NodeInternalsState,
} from "../document/stores.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import type { Node, Position } from "../document/types.js";
import {
  areMiniMapNodesRenderableInputsEqual,
  MiniMapNodes,
  MiniMapNodesReactive,
} from "./MiniMapNodes.js";
import type { MiniMapNodesType, MiniMapProps } from "./types.js";

const defaultWidth = 200;
const defaultHeight = 150;
const defaultMiniMapProps = {
  nodeStrokeColor: "transparent",
  nodeColor: "#e2e2e2",
  nodeClassName: "",
  nodeBorderRadius: 5,
  nodeStrokeWidth: 2,
  maskColor: "rgb(240, 240, 240, 0.6)",
  maskStrokeColor: "none",
  maskStrokeWidth: 1,
  position: "bottom-right",
  pannable: false,
  offsetScale: 5,
} satisfies Pick<
  MiniMapProps,
  | "nodeStrokeColor"
  | "nodeColor"
  | "nodeClassName"
  | "nodeBorderRadius"
  | "nodeStrokeWidth"
  | "maskColor"
  | "maskStrokeColor"
  | "maskStrokeWidth"
  | "position"
  | "pannable"
  | "offsetScale"
>;

type MiniMapSelector = {
  viewBB: Rect;
  boundingRect: Rect;
};

type MiniMapPanState = {
  runtime: ReturnType<typeof getWorkspaceXyflowRuntime>;
  viewport: WorkspaceXyflowViewport;
  translateExtent: ReactFlowState["translateExtent"];
  width: ReactFlowState["width"];
  height: ReactFlowState["height"];
};

type MiniMapMouseDragState = {
  moved: boolean;
  restoreSelection: () => void;
  startX: number;
  startY: number;
  view: Window;
};

type XYWidthHeightParams = {
  boundingRect: Rect;
  elementHeight: number;
  elementWidth: number;
  offsetScale: number;
};

type XYWidthHeightResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewScale: number;
  offset: number;
};

type MinimapSvgProps = Omit<MiniMapNodesType, "onClick"> & {
  elementWidth: number;
  elementHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  svgRef?: RefObject<SVGSVGElement | null>;
  onSvgClick?: (event: ReactMouseEvent<SVGSVGElement>) => void;
  onNavigate?: (position: Position) => void;
  onSvgNodeClick?: MiniMapNodesType["onClick"];
  offset: number;
  viewBB: Rect;
  boundingRect: Rect;
  ariaLabel?: string;
  maskColor: string;
  maskStrokeColor: string;
  maskStrokeWidth: number;
  nodes: Array<Node> | null;
  enableSelectionSync?: boolean;
};

function areStringArraysEqual(left: Array<string>, right: Array<string>) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function syncSelectedMiniMapNodes(
  svg: SVGSVGElement | null | undefined,
  activeIds: Array<string>,
) {
  if (!svg) {
    return;
  }

  const activeIdSet = new Set(activeIds);
  const nodes = svg.querySelectorAll<SVGElement>("[data-minimap-node-id]");
  for (const node of nodes) {
    const sectionId = node.dataset.minimapNodeId;
    if (!sectionId) {
      continue;
    }
    node.classList.toggle("selected", activeIdSet.has(sectionId));
  }
}

const selectNodes = (s: NodeInternalsState) => Array.from(s.x.values());

function getSelector(host: WorkspaceHost, nodes: Array<Node>) {
  return (s: ReactFlowState): MiniMapSelector => {
    const viewBB: Rect = getPaneRect(host, s);

    return {
      viewBB,
      boundingRect:
        nodes.length > 0
          ? getBoundsOfRects(getNodesBounds(nodes), viewBB)
          : viewBB,
    };
  };
}

function getMiniMapDimension(
  value: number | string | undefined,
  fallback: number,
) {
  return typeof value === "number" ? value : fallback;
}

function getMiniMapPanState(host: WorkspaceHost): MiniMapPanState | null {
  const runtime = getWorkspaceXyflowRuntime(host);
  const viewport = runtime.getViewport();
  if (!viewport) {
    return null;
  }
  const { translateExtent, width, height } = getReactFlowStore(host).getState();
  return { runtime, viewport, translateExtent, width, height };
}

function constrainMiniMapViewport(
  viewport: WorkspaceXyflowViewport,
  extent: CoordinateExtent,
  translateExtent: CoordinateExtent,
): WorkspaceXyflowViewport {
  const dx0 =
    (extent[0][0] - viewport.x) / viewport.zoom - translateExtent[0][0];
  const dx1 =
    (extent[1][0] - viewport.x) / viewport.zoom - translateExtent[1][0];
  const dy0 =
    (extent[0][1] - viewport.y) / viewport.zoom - translateExtent[0][1];
  const dy1 =
    (extent[1][1] - viewport.y) / viewport.zoom - translateExtent[1][1];
  const translateX =
    dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1);
  const translateY =
    dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1);

  return {
    x: viewport.x + translateX * viewport.zoom,
    y: viewport.y + translateY * viewport.zoom,
    zoom: viewport.zoom,
  };
}

function createMiniMapPanHandler(
  host: WorkspaceHost,
  viewScaleRef: { current: number },
) {
  return (event: MouseEvent) => {
    const panState = getMiniMapPanState(host);
    if (!panState) {
      return;
    }

    const moveScale =
      viewScaleRef.current *
      Math.max(panState.viewport.zoom, Math.log(panState.viewport.zoom));
    const extent: CoordinateExtent = [
      [0, 0],
      [panState.width, panState.height],
    ];

    const constrainedViewport = constrainMiniMapViewport(
      {
        x: panState.viewport.x - event.movementX * moveScale,
        y: panState.viewport.y - event.movementY * moveScale,
        zoom: panState.viewport.zoom,
      },
      extent,
      panState.translateExtent,
    );
    void panState.runtime.setViewport(constrainedViewport);
  };
}

function preventMiniMapNativeEvent(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function stopMiniMapNativeEventPropagation(event: Event) {
  event.stopImmediatePropagation();
}

function isMiniMapGestureAllowed(event: {
  button?: number;
  ctrlKey: boolean;
  type: string;
}) {
  return (!event.ctrlKey || event.type === "wheel") && !event.button;
}

function isMiniMapTouchable(svg: SVGSVGElement) {
  return (
    Boolean(svg.ownerDocument.defaultView?.navigator.maxTouchPoints) ||
    "ontouchstart" in svg
  );
}

function supportsMiniMapSelectStart(root: HTMLElement) {
  return "onselectstart" in root;
}

function disableMiniMapTextSelection(view: Window) {
  const root = view.document.documentElement;
  view.addEventListener("dragstart", preventMiniMapNativeEvent, true);
  if (supportsMiniMapSelectStart(root)) {
    view.addEventListener("selectstart", preventMiniMapNativeEvent, true);
    return () => {
      view.removeEventListener("dragstart", preventMiniMapNativeEvent, true);
      view.removeEventListener("selectstart", preventMiniMapNativeEvent, true);
    };
  }

  const mozUserSelect = root.style.getPropertyValue("-moz-user-select");
  root.style.setProperty("-moz-user-select", "none");
  return () => {
    view.removeEventListener("dragstart", preventMiniMapNativeEvent, true);
    if (mozUserSelect) {
      root.style.setProperty("-moz-user-select", mozUserSelect);
      return;
    }
    root.style.removeProperty("-moz-user-select");
  };
}

function suppressMiniMapClick(view: Window) {
  view.addEventListener("click", preventMiniMapNativeEvent, true);
  const timeout = view.setTimeout(() => {
    view.removeEventListener("click", preventMiniMapNativeEvent, true);
  }, 0);
  return () => {
    view.clearTimeout(timeout);
    view.removeEventListener("click", preventMiniMapNativeEvent, true);
  };
}

function bindMiniMapInteractions({
  host,
  svg,
  pannable,
  viewScaleRef,
}: {
  host: WorkspaceHost;
  svg: SVGSVGElement | null;
  pannable: boolean;
  viewScaleRef: { current: number };
}) {
  if (!svg) {
    return undefined;
  }

  const pan = createMiniMapPanHandler(host, viewScaleRef);
  const touchable = isMiniMapTouchable(svg);
  if (touchable) {
    svg.style.setProperty("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
  }
  let dragState: MiniMapMouseDragState | null = null;
  let touchActive = false;
  let touchEnding = false;
  let touchEndingTimeout: number | undefined;
  let removeClickSuppression: (() => void) | null = null;

  const endMouseDrag = () => {
    const currentDragState = dragState;
    if (!currentDragState) {
      return null;
    }
    currentDragState.view.removeEventListener(
      "mousemove",
      handleMouseMove,
      true,
    );
    currentDragState.view.removeEventListener("mouseup", handleMouseUp, true);
    currentDragState.restoreSelection();
    dragState = null;
    return currentDragState;
  };

  const handleMouseMove = (event: MouseEvent) => {
    const currentDragState = dragState;
    if (!currentDragState) {
      return;
    }
    preventMiniMapNativeEvent(event);
    if (!currentDragState.moved) {
      const deltaX = event.clientX - currentDragState.startX;
      const deltaY = event.clientY - currentDragState.startY;
      currentDragState.moved = deltaX * deltaX + deltaY * deltaY > 0;
    }
    if (pannable) {
      pan(event);
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    const currentDragState = endMouseDrag();
    if (!currentDragState) {
      return;
    }
    if (currentDragState.moved) {
      removeClickSuppression?.();
      removeClickSuppression = suppressMiniMapClick(currentDragState.view);
    }
    preventMiniMapNativeEvent(event);
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (touchEnding || !isMiniMapGestureAllowed(event)) {
      return;
    }
    const view = event.view ?? svg.ownerDocument.defaultView;
    if (!view) {
      return;
    }
    dragState = {
      moved: false,
      restoreSelection: disableMiniMapTextSelection(view),
      startX: event.clientX,
      startY: event.clientY,
      view,
    };
    view.addEventListener("mousemove", handleMouseMove, true);
    view.addEventListener("mouseup", handleMouseUp, true);
    stopMiniMapNativeEventPropagation(event);
  };

  const handleWheel = (event: WheelEvent) => {
    if (!isMiniMapGestureAllowed(event) || event.deltaY === 0) {
      return;
    }
    preventMiniMapNativeEvent(event);
  };

  const handleDoubleClick = (event: MouseEvent) => {
    if (!isMiniMapGestureAllowed(event)) {
      return;
    }
    preventMiniMapNativeEvent(event);
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (!isMiniMapGestureAllowed(event)) {
      return;
    }
    touchActive = true;
    stopMiniMapNativeEventPropagation(event);
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (!touchActive) {
      return;
    }
    preventMiniMapNativeEvent(event);
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (!touchActive) {
      return;
    }
    stopMiniMapNativeEventPropagation(event);
    if (event.touches.length > 0) {
      return;
    }
    touchActive = false;
    touchEnding = true;
    const view = event.view ?? svg.ownerDocument.defaultView;
    if (!view) {
      return;
    }
    if (touchEndingTimeout !== undefined) {
      view.clearTimeout(touchEndingTimeout);
    }
    touchEndingTimeout = view.setTimeout(() => {
      touchEnding = false;
      touchEndingTimeout = undefined;
    }, 500);
  };

  svg.addEventListener("mousedown", handleMouseDown);
  svg.addEventListener("wheel", handleWheel, { passive: false });
  svg.addEventListener("dblclick", handleDoubleClick);
  if (touchable) {
    svg.addEventListener("touchstart", handleTouchStart);
    svg.addEventListener("touchmove", handleTouchMove, { passive: false });
    svg.addEventListener("touchend", handleTouchEnd);
    svg.addEventListener("touchcancel", handleTouchEnd);
  }

  return () => {
    endMouseDrag();
    removeClickSuppression?.();
    if (touchEndingTimeout !== undefined) {
      const view = svg.ownerDocument.defaultView;
      view?.clearTimeout(touchEndingTimeout);
    }
    svg.removeEventListener("mousedown", handleMouseDown);
    svg.removeEventListener("wheel", handleWheel);
    svg.removeEventListener("dblclick", handleDoubleClick);
    if (touchable) {
      svg.removeEventListener("touchstart", handleTouchStart);
      svg.removeEventListener("touchmove", handleTouchMove);
      svg.removeEventListener("touchend", handleTouchEnd);
      svg.removeEventListener("touchcancel", handleTouchEnd);
    }
  };
}

function getMiniMapPointerPosition(event: ReactMouseEvent<SVGSVGElement>) {
  const svg = event.currentTarget;
  if (svg.createSVGPoint) {
    const screenMatrix = svg.getScreenCTM();
    if (screenMatrix) {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const transformedPoint = point.matrixTransform(screenMatrix.inverse());
      return { x: transformedPoint.x, y: transformedPoint.y };
    }
  }

  const rect = svg.getBoundingClientRect();
  return {
    x: event.clientX - rect.left - svg.clientLeft,
    y: event.clientY - rect.top - svg.clientTop,
  };
}

function createMiniMapClickHandler(
  onClick: MiniMapProps["onClick"],
): MinimapSvgProps["onSvgClick"] {
  if (!onClick) {
    return undefined;
  }

  return (event: ReactMouseEvent<SVGSVGElement>) => {
    onClick(event, getMiniMapPointerPosition(event));
  };
}

function resolveMiniMapProps(props: MiniMapProps) {
  return { ...defaultMiniMapProps, ...props };
}

function assignDefinedProp<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function buildMinimapSvgProps(args: {
  elementWidth: number;
  elementHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  svgRef: RefObject<SVGSVGElement | null>;
  offset: number;
  viewBB: Rect;
  boundingRect: Rect;
  ariaLabel: string | undefined;
  maskColor: string;
  maskStrokeColor: string;
  maskStrokeWidth: number;
  onSvgClick: MinimapSvgProps["onSvgClick"];
  onNavigate: MinimapSvgProps["onNavigate"];
  nodeColor: MinimapSvgProps["nodeColor"];
  nodeStrokeColor: MinimapSvgProps["nodeStrokeColor"];
  nodeBorderRadius: MinimapSvgProps["nodeBorderRadius"];
  nodeClassName: MinimapSvgProps["nodeClassName"];
  nodeStrokeWidth: MinimapSvgProps["nodeStrokeWidth"];
  nodeComponent: MinimapSvgProps["nodeComponent"];
}): MinimapSvgProps {
  const props: MinimapSvgProps = {
    elementWidth: args.elementWidth,
    elementHeight: args.elementHeight,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    svgRef: args.svgRef,
    offset: args.offset,
    viewBB: args.viewBB,
    boundingRect: args.boundingRect,
    maskColor: args.maskColor,
    maskStrokeColor: args.maskStrokeColor,
    maskStrokeWidth: args.maskStrokeWidth,
    nodes: null,
    enableSelectionSync: true,
  };
  assignDefinedProp(props, "onSvgClick", args.onSvgClick);
  assignDefinedProp(props, "onNavigate", args.onNavigate);
  assignDefinedProp(props, "ariaLabel", args.ariaLabel);
  assignDefinedProp(props, "nodeColor", args.nodeColor);
  assignDefinedProp(props, "nodeStrokeColor", args.nodeStrokeColor);
  assignDefinedProp(props, "nodeBorderRadius", args.nodeBorderRadius);
  assignDefinedProp(props, "nodeClassName", args.nodeClassName);
  assignDefinedProp(props, "nodeStrokeWidth", args.nodeStrokeWidth);
  assignDefinedProp(props, "nodeComponent", args.nodeComponent);
  return props;
}

function buildMiniMapNodesProps(args: {
  onSvgNodeClick: MiniMapNodesType["onClick"];
  nodeColor: MiniMapNodesType["nodeColor"];
  nodeStrokeColor: MiniMapNodesType["nodeStrokeColor"];
  nodeBorderRadius: MiniMapNodesType["nodeBorderRadius"];
  nodeClassName: MiniMapNodesType["nodeClassName"];
  nodeStrokeWidth: MiniMapNodesType["nodeStrokeWidth"];
  nodeComponent: MiniMapNodesType["nodeComponent"];
}): MiniMapNodesType {
  const props: MiniMapNodesType = {};
  assignDefinedProp(props, "onClick", args.onSvgNodeClick);
  assignDefinedProp(props, "nodeColor", args.nodeColor);
  assignDefinedProp(props, "nodeStrokeColor", args.nodeStrokeColor);
  assignDefinedProp(props, "nodeBorderRadius", args.nodeBorderRadius);
  assignDefinedProp(props, "nodeClassName", args.nodeClassName);
  assignDefinedProp(props, "nodeStrokeWidth", args.nodeStrokeWidth);
  assignDefinedProp(props, "nodeComponent", args.nodeComponent);
  return props;
}

export function getXYWidthHeight({
  boundingRect,
  elementHeight,
  elementWidth,
  offsetScale,
}: XYWidthHeightParams): XYWidthHeightResult {
  const scaledWidth = boundingRect.width / elementWidth;
  const scaledHeight = boundingRect.height / elementHeight;
  const viewScale = Math.max(scaledWidth, scaledHeight);
  const viewWidth = viewScale * elementWidth;
  const viewHeight = viewScale * elementHeight;
  const offset = offsetScale * viewScale;
  const x = boundingRect.x - (viewWidth - boundingRect.width) / 2 - offset;
  const y = boundingRect.y - (viewHeight - boundingRect.height) / 2 - offset;
  const width = viewWidth + offset * 2;
  const height = viewHeight + offset * 2;
  return { x, y, width, height, viewScale, offset };
}

export function resolveMiniMapKeyboardPosition({
  key,
  viewBB,
  boundingRect,
}: {
  key: string;
  viewBB: Rect;
  boundingRect: Rect;
}): Position | null {
  const centerX = viewBB.x + viewBB.width / 2;
  const centerY = viewBB.y + viewBB.height / 2;
  if (key === "ArrowLeft") {
    return { x: centerX - viewBB.width / 10, y: centerY };
  }
  if (key === "ArrowRight") {
    return { x: centerX + viewBB.width / 10, y: centerY };
  }
  if (key === "ArrowUp") {
    return { x: centerX, y: centerY - viewBB.height / 10 };
  }
  if (key === "ArrowDown") {
    return { x: centerX, y: centerY + viewBB.height / 10 };
  }
  if (key === "Enter" || key === " ") {
    return {
      x: boundingRect.x + boundingRect.width / 2,
      y: boundingRect.y + boundingRect.height / 2,
    };
  }
  return null;
}

function MiniMap(props: MiniMapProps) {
  const host = useWorkspaceHost();
  const {
    style,
    className,
    nodeStrokeColor,
    nodeColor,
    nodeClassName,
    nodeBorderRadius,
    nodeStrokeWidth,

    nodeComponent,
    maskColor,
    maskStrokeColor,
    maskStrokeWidth,
    position,
    onClick,
    onNavigate,
    pannable,
    offsetScale,
    "aria-label": ariaLabel,
  } = resolveMiniMapProps(props);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodes = useNodeInternals(
    selectNodes,
    areMiniMapNodesRenderableInputsEqual,
  );
  const { boundingRect, viewBB } = useReactFlow(
    getSelector(host, nodes),
    shallow,
  );
  const elementWidth = getMiniMapDimension(style?.width, defaultWidth);
  const elementHeight = getMiniMapDimension(style?.height, defaultHeight);

  const { x, y, width, height, viewScale, offset } = getXYWidthHeight({
    boundingRect,
    elementHeight,
    elementWidth,
    offsetScale,
  });
  const viewScaleRef = useRef<number>(0);

  viewScaleRef.current = viewScale;

  useEffect(() => {
    return bindMiniMapInteractions({
      host,
      svg: svgRef.current,
      pannable,
      viewScaleRef,
    });
  }, [host, pannable]);

  const onSvgClick = createMiniMapClickHandler(onClick);
  const minimapSvgProps = buildMinimapSvgProps({
    elementWidth,
    elementHeight,
    x,
    y,
    width,
    height,
    svgRef,
    offset,
    viewBB,
    boundingRect,
    ariaLabel,
    maskColor,
    maskStrokeColor,
    maskStrokeWidth,
    onSvgClick,
    onNavigate,
    nodeColor,
    nodeStrokeColor,
    nodeBorderRadius,
    nodeClassName,
    nodeStrokeWidth,
    nodeComponent,
  });

  return (
    <Panel
      position={position}
      style={style}
      className={cc(["react-flow__minimap", className])}
      data-testid="rf__minimap"
    >
      <MinimapSvg {...minimapSvgProps} />
    </Panel>
  );
}

MiniMap.displayName = "MiniMap";

export default memo(MiniMap);

function createMiniMapKeyDownHandler({
  onNavigate,
  viewBB,
  boundingRect,
}: {
  onNavigate: MinimapSvgProps["onNavigate"];
  viewBB: Rect;
  boundingRect: Rect;
}): KeyboardEventHandler<SVGSVGElement> | undefined {
  if (!onNavigate) {
    return undefined;
  }
  return (event) => {
    const nextPosition = resolveMiniMapKeyboardPosition({
      key: event.key,
      viewBB,
      boundingRect,
    });
    if (!nextPosition) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onNavigate(nextPosition);
  };
}

function getMiniMapAccessibilityProps({
  onNavigate,
  ariaLabel,
  onKeyDown,
}: {
  onNavigate: MinimapSvgProps["onNavigate"];
  ariaLabel: string;
  onKeyDown: KeyboardEventHandler<SVGSVGElement> | undefined;
}) {
  if (!onNavigate) {
    return { role: "img" as const, "aria-label": ariaLabel };
  }
  return {
    role: "button" as const,
    "aria-label": `${ariaLabel}. Use arrow keys to pan; press Enter to center the workspace`,
    tabIndex: 0,
    onKeyDown,
  };
}

function renderMiniMapNodes(
  nodes: Array<Node> | null,
  minimapNodesProps: MiniMapNodesType,
) {
  return nodes ? (
    <MiniMapNodes nodes={nodes} {...minimapNodesProps} />
  ) : (
    <MiniMapNodesReactive {...minimapNodesProps} />
  );
}

function renderMiniMapSelectionSync(
  enabled: boolean,
  selectionSyncProps: { svgRef: RefObject<SVGSVGElement | null> } | null,
) {
  if (!enabled || !selectionSyncProps) {
    return null;
  }
  return <MiniMapSelectionSync {...selectionSyncProps} />;
}

function MiniMapSelectionSync({
  svgRef,
}: {
  svgRef?: RefObject<SVGSVGElement | null>;
}) {
  const host = useWorkspaceHost();
  useEffect(() => {
    const applySelection = (activeIds: Array<string>) => {
      syncSelectedMiniMapNodes(svgRef?.current, activeIds);
    };

    const activeSectionsStore = getActiveSectionsStore(host);
    applySelection(activeSectionsStore.getState().activeIds);

    const unsubscribe = activeSectionsStore.subscribe(
      (state, previousState) => {
        if (!areStringArraysEqual(state.activeIds, previousState.activeIds)) {
          applySelection(state.activeIds);
        }
      },
    );

    let observer: MutationObserver | null = null;
    if (svgRef?.current && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        applySelection(activeSectionsStore.getState().activeIds);
      });
      observer.observe(svgRef.current, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "data-minimap-node-id"],
      });
    }

    return () => {
      unsubscribe();
      observer?.disconnect();
    };
  }, [host, svgRef]);

  return null;
}

export function MinimapSvg({
  elementWidth,
  elementHeight,
  x,
  y,
  width,
  height,
  svgRef,
  onSvgClick,
  onNavigate,
  onSvgNodeClick,
  nodeColor,
  nodeStrokeColor,
  nodeBorderRadius,
  nodeClassName,
  nodeStrokeWidth,
  nodeComponent,
  offset,
  viewBB,
  boundingRect,
  ariaLabel = "Workspace minimap",
  maskColor,
  maskStrokeColor,
  maskStrokeWidth,
  nodes,
  enableSelectionSync = false,
}: MinimapSvgProps) {
  const minimapNodesProps = buildMiniMapNodesProps({
    onSvgNodeClick,
    nodeColor,
    nodeStrokeColor,
    nodeBorderRadius,
    nodeClassName,
    nodeStrokeWidth,
    nodeComponent,
  });
  const selectionSyncProps = svgRef === undefined ? null : { svgRef };
  const onKeyDown = createMiniMapKeyDownHandler({
    onNavigate,
    viewBB,
    boundingRect,
  });
  const accessibilityProps = getMiniMapAccessibilityProps({
    onNavigate,
    ariaLabel,
    onKeyDown,
  });

  return (
    <svg
      width={elementWidth}
      height={elementHeight}
      viewBox={`${x} ${y} ${width} ${height}`}
      ref={svgRef}
      onClick={onSvgClick}
      {...accessibilityProps}
    >
      {renderMiniMapNodes(nodes, minimapNodesProps)}
      {renderMiniMapSelectionSync(enableSelectionSync, selectionSyncProps)}
      <path
        className="react-flow__minimap-mask"
        d={`M${x - offset},${y - offset}h${width + offset * 2}v${height + offset * 2}h${-width - offset * 2}z
M${viewBB.x},${viewBB.y}h${viewBB.width}v${viewBB.height}h${-viewBB.width}z`}
        fill={maskColor}
        fillRule="evenodd"
        stroke={maskStrokeColor}
        strokeWidth={maskStrokeWidth}
        pointerEvents="none"
      />
    </svg>
  );
}
