import cc from "classcat";
import {
  type CSSProperties,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SVGProps,
} from "react";
import { GPU_FLOW_CLASS_NAMES } from "./gpuFlowDomClasses";
import {
  isMeasuredGpuNodeBoundsInput,
  type GpuNodeBoundsInput,
} from "./nodeBounds";
import type { GpuRect } from "./viewportMath";

export type GpuMiniMapNode = GpuNodeBoundsInput & {
  readonly id?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly tempZIndex?: number | undefined;
  readonly type?: string | null | undefined;
  readonly zIndex?: number | undefined;
};

type GpuMiniMapNodeAttribute = string | ((node: GpuMiniMapNode) => string);

type GpuMiniMapNodeProps = {
  readonly borderRadius: number;
  readonly className: string;
  readonly color: string;
  readonly dataMinimapNodeId?: string | undefined;
  readonly height: number;
  readonly id?: string | undefined;
  readonly onClick?:
    | ((event: ReactMouseEvent, nodeId: string) => void)
    | undefined;
  readonly shapeRendering?: SVGProps<SVGRectElement>["shapeRendering"];
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly style?: CSSProperties | undefined;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type GpuMiniMapNodesProps = {
  readonly nodeBorderRadius?: number | undefined;
  readonly nodeClassName?: GpuMiniMapNodeAttribute | undefined;
  readonly nodeColor?: GpuMiniMapNodeAttribute | undefined;
  readonly nodeComponent?: ComponentType<GpuMiniMapNodeProps> | undefined;
  readonly nodeStrokeColor?: GpuMiniMapNodeAttribute | undefined;
  readonly nodeStrokeWidth?: number | undefined;
  readonly onClick?:
    | ((event: ReactMouseEvent, nodeId: string) => void)
    | undefined;
  readonly shapeRendering?: SVGProps<SVGRectElement>["shapeRendering"];
};

type XYWidthHeightParams = {
  readonly boundingRect: GpuRect;
  readonly elementHeight: number;
  readonly elementWidth: number;
  readonly offsetScale: number;
};

type XYWidthHeightResult = {
  readonly height: number;
  readonly offset: number;
  readonly viewScale: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

type MinimapSvgProps = GpuMiniMapNodesProps & {
  readonly elementHeight: number;
  readonly elementWidth: number;
  readonly height: number;
  readonly maskColor: string;
  readonly maskRef?: RefObject<SVGPathElement | null> | undefined;
  readonly maskStrokeColor: string;
  readonly maskStrokeWidth: number;
  readonly nodes: readonly GpuMiniMapNode[];
  readonly offset: number;
  readonly onPointerCancel?:
    | ((event: ReactPointerEvent<SVGSVGElement>) => void)
    | undefined;
  readonly onPointerDown?:
    | ((event: ReactPointerEvent<SVGSVGElement>) => void)
    | undefined;
  readonly onPointerMove?:
    | ((event: ReactPointerEvent<SVGSVGElement>) => void)
    | undefined;
  readonly onPointerUp?:
    | ((event: ReactPointerEvent<SVGSVGElement>) => void)
    | undefined;
  readonly onSvgClick?:
    | ((event: ReactMouseEvent<SVGSVGElement>) => void)
    | undefined;
  readonly onSvgNodeClick?:
    | ((event: ReactMouseEvent, nodeId: string) => void)
    | undefined;
  readonly svgRef?: RefObject<SVGSVGElement | null> | undefined;
  readonly viewBB: GpuRect;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

const DEFAULT_NODE_COLOR = "#e2e2e2";
const DEFAULT_NODE_STROKE_COLOR = "transparent";
const DEFAULT_NODE_CLASS_NAME = "";
const DEFAULT_NODE_BORDER_RADIUS = 5;
const DEFAULT_NODE_STROKE_WIDTH = 2;

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
  return { height, offset, viewScale, width, x, y };
}

export function getMiniMapViewBox({
  height,
  width,
  x,
  y,
}: Pick<XYWidthHeightResult, "height" | "width" | "x" | "y">): string {
  return `${x} ${y} ${width} ${height}`;
}

export function getMiniMapMaskPath({
  height,
  offset,
  viewBB,
  width,
  x,
  y,
}: Pick<XYWidthHeightResult, "height" | "offset" | "width" | "x" | "y"> & {
  readonly viewBB: GpuRect;
}): string {
  return `M${x - offset},${y - offset}h${width + offset * 2}v${height + offset * 2}h${-width - offset * 2}z
M${viewBB.x},${viewBB.y}h${viewBB.width}v${viewBB.height}h${-viewBB.width}z`;
}

export function syncSelectedMiniMapNodes(
  svg: SVGSVGElement | null | undefined,
  activeIds: readonly string[],
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

export function areMiniMapNodesRenderableInputsEqual(
  left: readonly GpuMiniMapNode[],
  right: readonly GpuMiniMapNode[],
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftNode = left[index];
    const rightNode = right[index];
    if (!leftNode || !rightNode) {
      return false;
    }
    if (!areMiniMapNodeRenderableFieldsEqual(leftNode, rightNode)) {
      return false;
    }
  }
  return true;
}

export function MinimapSvg({
  elementHeight,
  elementWidth,
  height,
  maskColor,
  maskRef,
  maskStrokeColor,
  maskStrokeWidth,
  nodes,
  nodeBorderRadius,
  nodeClassName,
  nodeColor,
  nodeComponent,
  nodeStrokeColor,
  nodeStrokeWidth,
  offset,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSvgClick,
  onSvgNodeClick,
  shapeRendering,
  svgRef,
  viewBB,
  width,
  x,
  y,
}: MinimapSvgProps) {
  return (
    <svg
      width={elementWidth}
      height={elementHeight}
      viewBox={getMiniMapViewBox({ height, width, x, y })}
      role="img"
      ref={svgRef}
      onClick={onSvgClick}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <GpuMiniMapNodes
        nodes={nodes}
        nodeBorderRadius={nodeBorderRadius}
        nodeClassName={nodeClassName}
        nodeColor={nodeColor}
        nodeComponent={nodeComponent}
        nodeStrokeColor={nodeStrokeColor}
        nodeStrokeWidth={nodeStrokeWidth}
        onClick={onSvgNodeClick}
        shapeRendering={shapeRendering}
      />
      <path
        className={GPU_FLOW_CLASS_NAMES.minimapMask}
        d={getMiniMapMaskPath({ height, offset, viewBB, width, x, y })}
        fill={maskColor}
        fillRule="evenodd"
        ref={maskRef}
        stroke={maskStrokeColor}
        strokeWidth={maskStrokeWidth}
        pointerEvents="none"
      />
    </svg>
  );
}

function GpuMiniMapNodes(
  props: GpuMiniMapNodesProps & {
    readonly nodes: readonly GpuMiniMapNode[];
  },
) {
  const {
    nodes,
    nodeBorderRadius = DEFAULT_NODE_BORDER_RADIUS,
    nodeClassName = DEFAULT_NODE_CLASS_NAME,
    nodeColor = DEFAULT_NODE_COLOR,
    nodeComponent: NodeComponent = GpuMiniMapNodeRect,
    nodeStrokeColor = DEFAULT_NODE_STROKE_COLOR,
    nodeStrokeWidth = DEFAULT_NODE_STROKE_WIDTH,
    onClick,
    shapeRendering,
  } = props;
  const nodeColorFunc = getAttrFunction(nodeColor);
  const nodeStrokeColorFunc = getAttrFunction(nodeStrokeColor);
  const nodeClassNameFunc = getAttrFunction(nodeClassName);
  const renderableNodes = nodes.filter(isRenderableMiniMapNode);
  const resolvedShapeRendering =
    shapeRendering ?? getDefaultMiniMapShapeRendering();

  return (
    <>
      {renderableNodes.map((node, index) => {
        const { x, y } = node.position;
        const nodeId = node.id;
        return (
          <NodeComponent
            key={nodeId ?? index}
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            dataMinimapNodeId={nodeId}
            className={nodeClassNameFunc(node)}
            color={nodeColorFunc(node)}
            borderRadius={nodeBorderRadius}
            strokeColor={nodeStrokeColorFunc(node)}
            strokeWidth={nodeStrokeWidth}
            shapeRendering={resolvedShapeRendering}
            onClick={onClick}
            id={nodeId}
            style={node.style}
          />
        );
      })}
    </>
  );
}

function GpuMiniMapNodeRect({
  borderRadius,
  className,
  color,
  dataMinimapNodeId,
  height,
  id,
  onClick,
  shapeRendering,
  strokeColor,
  strokeWidth,
  style,
  width,
  x,
  y,
}: GpuMiniMapNodeProps) {
  const fill =
    color || String(style?.background ?? style?.backgroundColor ?? "");

  return (
    <rect
      className={cc([GPU_FLOW_CLASS_NAMES.minimapNode, className])}
      data-minimap-node-id={dataMinimapNodeId}
      x={x}
      y={y}
      rx={borderRadius}
      ry={borderRadius}
      width={width}
      height={height}
      fill={fill}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      shapeRendering={shapeRendering}
      onClick={onClick && id ? (event) => onClick(event, id) : undefined}
    />
  );
}

function getAttrFunction(
  func: GpuMiniMapNodeAttribute,
): (node: GpuMiniMapNode) => string {
  return typeof func === "function" ? func : () => func;
}

function getDefaultMiniMapShapeRendering():
  | SVGProps<SVGRectElement>["shapeRendering"]
  | undefined {
  const isBrowser = typeof window !== "undefined";
  const isChrome = isBrowser && "chrome" in window;
  return !isBrowser || isChrome ? "crispEdges" : "geometricPrecision";
}

function isRenderableMiniMapNode(
  node: GpuMiniMapNode,
): node is GpuMiniMapNode & {
  readonly height: number;
  readonly width: number;
} {
  return isMeasuredGpuNodeBoundsInput(node);
}

function areNodeStylesEqual(
  left: CSSProperties | undefined,
  right: CSSProperties | undefined,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return left === right;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (
      left[key as keyof CSSProperties] !== right[key as keyof CSSProperties]
    ) {
      return false;
    }
  }
  return true;
}

const MINI_MAP_RENDERABLE_FIELD_SELECTORS = [
  (node: GpuMiniMapNode) => node.id,
  (node: GpuMiniMapNode) => node.position.x,
  (node: GpuMiniMapNode) => node.position.y,
  (node: GpuMiniMapNode) => node.width,
  (node: GpuMiniMapNode) => node.height,
  (node: GpuMiniMapNode) => node.zIndex,
  (node: GpuMiniMapNode) => node.tempZIndex,
  (node: GpuMiniMapNode) => node.type,
] as const;

function areMiniMapNodeRenderableFieldsEqual(
  left: GpuMiniMapNode,
  right: GpuMiniMapNode,
) {
  for (const selector of MINI_MAP_RENDERABLE_FIELD_SELECTORS) {
    if (selector(left) !== selector(right)) {
      return false;
    }
  }
  return areNodeStylesEqual(left.style, right.style);
}
