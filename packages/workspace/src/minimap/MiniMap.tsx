import cc from "classcat";
import { pointer, select } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import {
  memo,
  useEffect,
  useRef,
  type KeyboardEventHandler,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { shallow } from "zustand/shallow";
import Panel from "../canvas/Panel";
import { getNodesBounds, getPaneRect } from "../canvas/graph";
import { useReactFlow } from "../canvas/store";
import type { CoordinateExtent, ReactFlowState, Rect } from "../canvas/types";
import { getBoundsOfRects } from "../canvas/utils";
import { useActiveSections, useNodeInternals, type NodeInternalsState } from "../document/stores";
import type { Node, Position } from "../document/types";
import {
  areMiniMapNodesRenderableInputsEqual,
  MiniMapNodes,
  MiniMapNodesReactive,
} from "./MiniMapNodes";
import type { MiniMapNodesType, MiniMapProps } from "./types";

// The fork's `minimap/MiniMap.tsx`. Cut at extraction with the surfaces the reference
// application never reaches: the wheel-zoom handler behind `zoomable` (the app mounts the
// minimap pannable-only), `inversePan`/`zoomStep`, and the `onNodeClick` node handler. The
// mask and the click coordinate read the shell's physical pane insets through `getPaneRect`
// and `setCenter`, where the reference reads its own Overview and UI-editor rail widths.
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
  transform: ReactFlowState["transform"];
  d3Selection: NonNullable<ReactFlowState["d3Selection"]>;
  d3Zoom: NonNullable<ReactFlowState["d3Zoom"]>;
  translateExtent: ReactFlowState["translateExtent"];
  width: ReactFlowState["width"];
  height: ReactFlowState["height"];
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

function getSelector(nodes: Array<Node>) {
  return (s: ReactFlowState): MiniMapSelector => {
    const viewBB: Rect = getPaneRect(s);

    return {
      viewBB,
      boundingRect: nodes.length > 0 ? getBoundsOfRects(getNodesBounds(nodes), viewBB) : viewBB,
    };
  };
}

function getMiniMapDimension(value: number | string | undefined, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function isMouseMoveEvent(sourceEvent: Event | null | undefined): sourceEvent is MouseEvent {
  return sourceEvent?.type === "mousemove";
}

function getMiniMapPanState(): MiniMapPanState | null {
  const { transform, d3Selection, d3Zoom, translateExtent, width, height } =
    useReactFlow.getState();
  if (!d3Selection || !d3Zoom) {
    return null;
  }
  return { transform, d3Selection, d3Zoom, translateExtent, width, height };
}

function createMiniMapPanHandler(viewScaleRef: { current: number }) {
  return (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
    if (!isMouseMoveEvent(event.sourceEvent)) {
      return;
    }

    const panState = getMiniMapPanState();
    if (!panState) {
      return;
    }

    const moveScale =
      viewScaleRef.current * Math.max(panState.transform[2], Math.log(panState.transform[2]));
    const position = {
      x: panState.transform[0] - event.sourceEvent.movementX * moveScale,
      y: panState.transform[1] - event.sourceEvent.movementY * moveScale,
    };
    const extent: CoordinateExtent = [
      [0, 0],
      [panState.width, panState.height],
    ];

    const nextTransform = zoomIdentity
      .translate(position.x, position.y)
      .scale(panState.transform[2]);
    const constrainedTransform = panState.d3Zoom.constrain()(
      nextTransform,
      extent,
      panState.translateExtent,
    );

    panState.d3Zoom.transform(panState.d3Selection, constrainedTransform);
  };
}

function bindMiniMapInteractions({
  svg,
  pannable,
  viewScaleRef,
}: {
  svg: SVGSVGElement | null;
  pannable: boolean;
  viewScaleRef: { current: number };
}) {
  if (!svg) {
    return undefined;
  }

  const selection = select(svg);
  const zoomBehavior = zoom<SVGSVGElement, unknown>();

  if (pannable) {
    zoomBehavior.on("zoom", createMiniMapPanHandler(viewScaleRef));
  }

  selection.call(zoomBehavior);

  return () => {
    selection.on("zoom", null);
  };
}

function createMiniMapClickHandler(
  onClick: MiniMapProps["onClick"],
): MinimapSvgProps["onSvgClick"] {
  if (!onClick) {
    return undefined;
  }

  return (event: ReactMouseEvent<SVGSVGElement>) => {
    const rfCoord = pointer(event);
    onClick(event, { x: rfCoord[0], y: rfCoord[1] });
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
    onNavigate,
    pannable,
    offsetScale,
    "aria-label": ariaLabel,
  } = resolveMiniMapProps(props);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodes = useNodeInternals(selectNodes, areMiniMapNodesRenderableInputsEqual);
  const { boundingRect, viewBB } = useReactFlow(getSelector(nodes), shallow);
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
      viewScaleRef,
    });
  }, [pannable]);

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

function renderMiniMapNodes(nodes: Array<Node> | null, minimapNodesProps: MiniMapNodesType) {
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

function MiniMapSelectionSync({ svgRef }: { svgRef?: RefObject<SVGSVGElement | null> }) {
  useEffect(() => {
    const applySelection = (activeIds: Array<string>) => {
      syncSelectedMiniMapNodes(svgRef?.current, activeIds);
    };

    applySelection(useActiveSections.getState().activeIds);

    // The reference store carries the subscribeWithSelector middleware; the package store is
    // plain, so the listener applies the reference's equality check itself.
    const unsubscribe = useActiveSections.subscribe((state, previousState) => {
      if (!areStringArraysEqual(state.activeIds, previousState.activeIds)) {
        applySelection(state.activeIds);
      }
    });

    let observer: MutationObserver | null = null;
    if (svgRef?.current && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        applySelection(useActiveSections.getState().activeIds);
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
  const onKeyDown = createMiniMapKeyDownHandler({ onNavigate, viewBB, boundingRect });
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
