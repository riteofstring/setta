import {
  getCanvasFlowLiveViewportSnapshot,
  subscribeCanvasFlowLiveViewport,
} from "canvasflow/canvasFlowLiveViewport";
import type { CanvasFlowViewport } from "canvasflow/canvasFlowTypes";
import { transformToCanvasFlowViewport } from "canvasflow/canvasFlowViewport";
import cc from "classcat";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { getNodes } from "state/actions/nodeInternals";
import {
  useActiveSectionUI,
  useLocalStorage,
  useNodeInternals,
} from "state/definitions";
import { shallow } from "zustand/shallow";
import Panel from "../core/components/Panel";
import type { Node, ReactFlowState, Rect } from "../core/types";
import { getBoundsOfRects, getWheelDelta } from "../core/utils";
import { getNodesBounds } from "../core/utils/graph";
import {
  areMiniMapNodesRenderableInputsEqual,
  MiniMapNodes,
  MiniMapNodesReactive,
} from "./MiniMapNodes";
import type { MiniMapNodesType, MiniMapProps } from "./types";

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
  zoomable: false,
  inversePan: false,
  zoomStep: 10,
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
  | "zoomable"
  | "inversePan"
  | "zoomStep"
  | "offsetScale"
>;

type MiniMapSelector = {
  domNode: HTMLDivElement | null;
  height: number;
  transform: ReactFlowState["transform"];
  width: number;
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
  onSvgNodeClick?: MiniMapNodesType["onClick"];
  offset: number;
  viewBB: Rect;
  maskColor: string;
  maskStrokeColor: string;
  maskStrokeWidth: number;
  nodes: Node[] | null;
  enableSelectionSync?: boolean;
};

function areStringArraysEqual(left: string[], right: string[]) {
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
  activeIds: string[],
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

function getSelector(s: ReactFlowState): MiniMapSelector {
  return {
    domNode: s.domNode,
    height: s.height,
    transform: s.transform,
    width: s.width,
  };
}

export function getMiniMapPaneRect(
  state: MiniMapSelector,
  overviewWidth: number,
  uiEditorWidth: number,
  liveViewport: CanvasFlowViewport | null,
): Rect {
  const viewport =
    liveViewport ?? transformToCanvasFlowViewport(state.transform);
  if (!state.domNode) {
    return {
      x: (-viewport.x + overviewWidth) / viewport.zoom,
      y: -viewport.y / viewport.zoom,
      width: state.width / viewport.zoom,
      height: state.height / viewport.zoom,
    };
  }

  const bounds = state.domNode.getBoundingClientRect();
  return {
    x: (overviewWidth - viewport.x) / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width:
      Math.max(bounds.width - overviewWidth - uiEditorWidth, 0) / viewport.zoom,
    height: Math.max(bounds.height, 0) / viewport.zoom,
  };
}

function getMiniMapDimension(
  value: number | string | undefined,
  fallback: number,
) {
  return typeof value === "number" ? value : fallback;
}

function createMiniMapZoomHandler(zoomStep: number) {
  return (event: WheelEvent) => {
    const { transform, width, height } = useReactFlow.getState();
    const pinchDelta = getWheelDelta(event, zoomStep);
    const nextZoom = transform[2] * Math.pow(2, pinchDelta);
    const centerWorldX = (width / 2 - transform[0]) / transform[2];
    const centerWorldY = (height / 2 - transform[1]) / transform[2];
    useReactFlow.setState({
      transform: [
        width / 2 - centerWorldX * nextZoom,
        height / 2 - centerWorldY * nextZoom,
        nextZoom,
      ],
    });
  };
}

function createMiniMapPanHandler(
  viewScaleRef: { current: number },
  inversePan: boolean,
) {
  return (movement: { movementX: number; movementY: number }) => {
    const { transform } = useReactFlow.getState();
    const moveScale =
      viewScaleRef.current *
      Math.max(transform[2], Math.log(transform[2])) *
      (inversePan ? -1 : 1);
    useReactFlow.setState({
      transform: [
        transform[0] - movement.movementX * moveScale,
        transform[1] - movement.movementY * moveScale,
        transform[2],
      ],
    });
  };
}

function bindMiniMapInteractions({
  svg,
  pannable,
  zoomable,
  inversePan,
  zoomStep,
  viewScaleRef,
}: {
  svg: SVGSVGElement | null;
  pannable: boolean;
  zoomable: boolean;
  inversePan: boolean;
  zoomStep: number;
  viewScaleRef: { current: number };
}) {
  if (!svg) {
    return undefined;
  }
  const pan = createMiniMapPanHandler(viewScaleRef, inversePan);
  const zoom = createMiniMapZoomHandler(zoomStep);
  let activePointerId: number | null = null;
  let lastClientX = 0;
  let lastClientY = 0;

  const handlePointerDown = (event: PointerEvent) => {
    if (!pannable || event.button !== 0) {
      return;
    }
    event.preventDefault();
    activePointerId = event.pointerId;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    svg.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    const movementX = event.clientX - lastClientX;
    const movementY = event.clientY - lastClientY;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    pan({ movementX, movementY });
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    activePointerId = null;
    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  };
  const handleWheel = (event: WheelEvent) => {
    if (!zoomable) {
      return;
    }
    event.preventDefault();
    zoom(event);
  };

  svg.addEventListener("pointerdown", handlePointerDown);
  svg.addEventListener("pointermove", handlePointerMove);
  svg.addEventListener("pointerup", handlePointerUp);
  svg.addEventListener("pointercancel", handlePointerUp);
  svg.addEventListener("wheel", handleWheel, { passive: false });

  return () => {
    svg.removeEventListener("pointerdown", handlePointerDown);
    svg.removeEventListener("pointermove", handlePointerMove);
    svg.removeEventListener("pointerup", handlePointerUp);
    svg.removeEventListener("pointercancel", handlePointerUp);
    svg.removeEventListener("wheel", handleWheel);
  };
}

function createMiniMapClickHandler(
  onClick: MiniMapProps["onClick"],
): MinimapSvgProps["onSvgClick"] {
  if (!onClick) {
    return undefined;
  }

  return (event: ReactMouseEvent<SVGSVGElement>) => {
    const rfCoord = getSvgPoint(event.currentTarget, event);
    if (!rfCoord) {
      return;
    }
    onClick(event, {
      x: rfCoord.x - useLocalStorage.getState().overviewTrueWidth,
      y: rfCoord.y,
    });
  };
}

function getSvgPoint(
  svg: SVGSVGElement,
  event: ReactMouseEvent<SVGSVGElement>,
): { x: number; y: number } | null {
  const transform = svg.getScreenCTM();
  if (!transform) {
    return null;
  }
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(transform.inverse());
}

function getMiniMapNodeOrThrow(nodeId: string): Node {
  const node = useNodeInternals.getState().x.get(nodeId);
  if (!node) {
    throw new Error(
      `MiniMap click target "${nodeId}" was not found in node internals.`,
    );
  }
  return node;
}

function createMiniMapNodeClickHandler(
  onNodeClick: MiniMapProps["onNodeClick"],
): MinimapSvgProps["onSvgNodeClick"] {
  if (!onNodeClick) {
    return undefined;
  }

  return (event: ReactMouseEvent, nodeId: string) => {
    onNodeClick(event, getMiniMapNodeOrThrow(nodeId));
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
  maskColor: string;
  maskStrokeColor: string;
  maskStrokeWidth: number;
  onSvgClick: MinimapSvgProps["onSvgClick"];
  onSvgNodeClick: MinimapSvgProps["onSvgNodeClick"];
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
    maskColor: args.maskColor,
    maskStrokeColor: args.maskStrokeColor,
    maskStrokeWidth: args.maskStrokeWidth,
    nodes: null,
    enableSelectionSync: true,
  };
  assignDefinedProp(props, "onSvgClick", args.onSvgClick);
  assignDefinedProp(props, "onSvgNodeClick", args.onSvgNodeClick);
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

function MiniMap(props: MiniMapProps) {
  const {
    style,
    className,
    nodeStrokeColor,
    nodeColor,
    nodeClassName,
    nodeBorderRadius,
    nodeStrokeWidth,
    // We need to rename the prop to be `CapitalCase` so that JSX will render it as
    // a component properly.
    nodeComponent,
    maskColor,
    maskStrokeColor,
    maskStrokeWidth,
    position,
    onClick,
    onNodeClick,
    pannable,
    zoomable,
    inversePan,
    zoomStep,
    offsetScale,
  } = resolveMiniMapProps(props);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodes = useNodeInternals(
    getNodes,
    areMiniMapNodesRenderableInputsEqual,
  );
  const overviewWidth = useLocalStorage((x) => x.overviewTrueWidth);
  const uiEditorWidth = useLocalStorage((x) => x.uiEditorTrueWidth);
  const viewportState = useReactFlow(getSelector, shallow);
  const liveViewport = useSyncExternalStore(
    subscribeCanvasFlowLiveViewport,
    getCanvasFlowLiveViewportSnapshot,
    getCanvasFlowLiveViewportSnapshot,
  );
  const nodeBounds = useMemo(
    () => (nodes.length > 0 ? getNodesBounds(nodes) : null),
    [nodes],
  );
  const viewBB = getMiniMapPaneRect(
    viewportState,
    overviewWidth,
    uiEditorWidth,
    liveViewport,
  );
  const boundingRect = nodeBounds
    ? getBoundsOfRects(nodeBounds, viewBB)
    : viewBB;
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
      svg: svgRef.current,
      pannable,
      zoomable,
      inversePan,
      zoomStep,
      viewScaleRef,
    });
  }, [pannable, zoomable, inversePan, zoomStep]);

  const onSvgClick = createMiniMapClickHandler(onClick);
  const onSvgNodeClick = createMiniMapNodeClickHandler(onNodeClick);
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
    maskColor,
    maskStrokeColor,
    maskStrokeWidth,
    onSvgClick,
    onSvgNodeClick,
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
      className={cc(["canvas-flow__minimap", className])}
      data-testid="rf__minimap"
    >
      <MinimapSvg {...minimapSvgProps} />
    </Panel>
  );
}

MiniMap.displayName = "MiniMap";

export default memo(MiniMap);

function MiniMapSelectionSync({
  svgRef,
}: {
  svgRef?: RefObject<SVGSVGElement | null>;
}) {
  useEffect(() => {
    const applySelection = (activeIds: string[]) => {
      syncSelectedMiniMapNodes(svgRef?.current, activeIds);
    };

    applySelection(useActiveSectionUI.getState().activeIds);

    const unsubscribe = useActiveSectionUI.subscribe(
      (state) => state.activeIds,
      (activeIds) => {
        applySelection(activeIds);
      },
      {
        equalityFn: areStringArraysEqual,
      },
    );

    let observer: MutationObserver | null = null;
    if (svgRef?.current && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        applySelection(useActiveSectionUI.getState().activeIds);
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
  }, [svgRef]);

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
  onSvgNodeClick,
  nodeColor,
  nodeStrokeColor,
  nodeBorderRadius,
  nodeClassName,
  nodeStrokeWidth,
  nodeComponent,
  offset,
  viewBB,
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

  return (
    <svg
      width={elementWidth}
      height={elementHeight}
      viewBox={`${x} ${y} ${width} ${height}`}
      role="img"
      ref={svgRef}
      onClick={onSvgClick}
    >
      {nodes ? (
        <MiniMapNodes nodes={nodes} {...minimapNodesProps} />
      ) : (
        <MiniMapNodesReactive {...minimapNodesProps} />
      )}
      {enableSelectionSync && selectionSyncProps ? (
        <MiniMapSelectionSync {...selectionSyncProps} />
      ) : null}
      {viewBB && (
        <path
          className="canvas-flow__minimap-mask"
          d={`M${x - offset},${y - offset}h${width + offset * 2}v${height + offset * 2}h${-width - offset * 2}z
M${viewBB.x},${viewBB.y}h${viewBB.width}v${viewBB.height}h${-viewBB.width}z`}
          fill={maskColor}
          fillRule="evenodd"
          stroke={maskStrokeColor}
          strokeWidth={maskStrokeWidth}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
