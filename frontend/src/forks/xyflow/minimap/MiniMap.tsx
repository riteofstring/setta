import cc from "classcat";
import { pointer, select } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { getNodes } from "state/actions/nodeInternals";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { shallow } from "zustand/shallow";
import Panel from "../core/components/Panel";
import type { CoordinateExtent, Node, Rect } from "../core/types";
import { getWheelDelta } from "../core/utils";
import { getNodesBounds, getPaneRect } from "../core/utils/graph";
import { MiniMapNodes } from "./MiniMapNodes";
import type { MiniMapNodesType, MiniMapProps } from "./types";

const defaultWidth = 200;
const defaultHeight = 150;

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
  svgRef?: RefObject<SVGSVGElement>;
  onClick?: MiniMapProps["onClick"];
  onSvgNodeClick?: MiniMapNodesType["onClick"];
  offset: number;
  viewBB?: Rect;
  maskColor: string;
  maskStrokeColor: string;
  maskStrokeWidth: number;
  nodes: Node[];
};

type ProjectedMiniMapNode = {
  className: string;
  color: string;
  height: number;
  id: string;
  left: number;
  selected: boolean;
  strokeColor: string;
  strokeWidth: number;
  top: number;
  width: number;
};

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

function MiniMap({
  style,
  className,
  nodeStrokeColor = "transparent",
  nodeColor = "#e2e2e2",
  nodeClassName = "",
  nodeBorderRadius = 5,
  nodeStrokeWidth = 2,
  // We need to rename the prop to be `CapitalCase` so that JSX will render it as
  // a component properly.
  nodeComponent,
  maskColor = "rgb(240, 240, 240, 0.6)",
  maskStrokeColor = "none",
  maskStrokeWidth = 1,
  position = "bottom-right",
  onClick,
  onNodeClick,
  pannable = false,
  zoomable = false,
  inversePan = false,
  zoomStep = 10,
  offsetScale = 5,
}: MiniMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodes = useNodeInternals(getNodes, shallow);
  const overviewWidth = useLocalStorage((x) => x.overviewTrueWidth);
  const uiEditorWidth = useLocalStorage((x) => x.uiEditorTrueWidth);
  const viewBB = useReactFlow(
    (state) => getPaneRect(state, overviewWidth, uiEditorWidth),
    shallow,
  );
  const boundingRect = useMemo(
    () => (nodes.length > 0 ? getNodesBounds(nodes) : viewBB),
    [nodes, viewBB],
  );
  const elementWidth =
    typeof style?.width === "number" ? style.width : defaultWidth;
  const elementHeight =
    typeof style?.height === "number" ? style.height : defaultHeight;

  const { x, y, width, height, viewScale, offset } = getXYWidthHeight({
    boundingRect,
    elementHeight,
    elementWidth,
    offsetScale,
  });
  const viewScaleRef = useRef<number>(0);

  viewScaleRef.current = viewScale;

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const selection = select(svgRef.current);

    const zoomHandler = (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      const { transform, d3Selection, d3Zoom } = useReactFlow.getState();
      const sourceEvent = event.sourceEvent as WheelEvent | null;

      if (
        !sourceEvent ||
        sourceEvent.type !== "wheel" ||
        !d3Selection ||
        !d3Zoom
      ) {
        return;
      }

      const pinchDelta = getWheelDelta(sourceEvent, zoomStep);
      const zoomLevel = transform[2] * Math.pow(2, pinchDelta);

      d3Zoom.scaleTo(d3Selection, zoomLevel);
    };

    const panHandler = (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      const { transform, d3Selection, d3Zoom, translateExtent, width, height } =
        useReactFlow.getState();
      const sourceEvent = event.sourceEvent as MouseEvent | null;

      if (
        !sourceEvent ||
        sourceEvent.type !== "mousemove" ||
        !d3Selection ||
        !d3Zoom
      ) {
        return;
      }

      const moveScale =
        viewScaleRef.current *
        Math.max(transform[2], Math.log(transform[2])) *
        (inversePan ? -1 : 1);
      const position = {
        x: transform[0] - sourceEvent.movementX * moveScale,
        y: transform[1] - sourceEvent.movementY * moveScale,
      };
      const extent: CoordinateExtent = [
        [0, 0],
        [width, height],
      ];

      const nextTransform = zoomIdentity
        .translate(position.x, position.y)
        .scale(transform[2]);
      const constrainedTransform = d3Zoom.constrain()(
        nextTransform,
        extent,
        translateExtent,
      );

      d3Zoom.transform(d3Selection, constrainedTransform);
    };

    const zoomAndPanHandler = zoom<SVGSVGElement, unknown>()
      .on("zoom", pannable ? panHandler : null)
      .on("zoom.wheel", zoomable ? zoomHandler : null);

    selection.call(zoomAndPanHandler);

    return () => {
      selection.on("zoom", null);
    };
  }, [pannable, zoomable, inversePan, zoomStep]);

  const onSvgNodeClick = onNodeClick
    ? (event: ReactMouseEvent, nodeId: string) => {
        const node = useNodeInternals.getState().x.get(nodeId)!;
        onNodeClick(event, node);
      }
    : undefined;

  return (
    <Panel
      position={position}
      style={style}
      className={cc(["react-flow__minimap", className])}
      data-testid="rf__minimap"
    >
      <MinimapSvg
        elementWidth={elementWidth}
        elementHeight={elementHeight}
        x={x}
        y={y}
        width={width}
        height={height}
        svgRef={svgRef}
        onClick={onClick}
        onSvgNodeClick={onSvgNodeClick}
        nodeColor={nodeColor}
        nodeStrokeColor={nodeStrokeColor}
        nodeBorderRadius={nodeBorderRadius}
        nodeClassName={nodeClassName}
        nodeStrokeWidth={nodeStrokeWidth}
        nodeComponent={nodeComponent}
        offset={offset}
        viewBB={viewBB}
        maskColor={maskColor}
        maskStrokeColor={maskStrokeColor}
        maskStrokeWidth={maskStrokeWidth}
        nodes={nodes}
      />
    </Panel>
  );
}

MiniMap.displayName = "MiniMap";

export default memo(MiniMap);

export function MinimapSvg({
  elementWidth,
  elementHeight,
  x,
  y,
  width,
  height,
  svgRef,
  onClick,
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
}: MinimapSvgProps) {
  const activeSectionIds = useProjectState((x) => x.projectConfig.activeIds);
  const activeSectionIdSet = useMemo(
    () => new Set(activeSectionIds),
    [activeSectionIds],
  );
  const minimapNodesProps: MiniMapNodesType = {
    onClick: onSvgNodeClick,
    nodeColor,
    nodeStrokeColor,
    nodeBorderRadius,
    nodeClassName,
    nodeStrokeWidth,
    nodeComponent,
  };
  const nodeColorFunc = useMemo(
    () => getNodeAttributeFunction(nodeColor),
    [nodeColor],
  );
  const nodeStrokeColorFunc = useMemo(
    () => getNodeAttributeFunction(nodeStrokeColor),
    [nodeStrokeColor],
  );
  const nodeClassNameFunc = useMemo(
    () => getNodeAttributeFunction(nodeClassName),
    [nodeClassName],
  );
  const projectedNodes = useMemo<Array<ProjectedMiniMapNode>>(() => {
    const scaleX = width === 0 ? 0 : elementWidth / width;
    const scaleY = height === 0 ? 0 : elementHeight / height;
    return nodes.map((node) => {
      const nodeX = node.position.x;
      const nodeY = node.position.y;
      return {
        id: node.id,
        left: (nodeX - x) * scaleX,
        top: (nodeY - y) * scaleY,
        width: (node.width ?? 0) * scaleX,
        height: (node.height ?? 0) * scaleY,
        color: nodeColorFunc(node),
        strokeColor: nodeStrokeColorFunc(node),
        strokeWidth: nodeStrokeWidth ?? 0,
        className: nodeClassNameFunc(node),
        selected: activeSectionIdSet.has(node.id),
      };
    });
  }, [
    activeSectionIdSet,
    elementHeight,
    elementWidth,
    height,
    nodeClassNameFunc,
    nodeColorFunc,
    nodeStrokeColorFunc,
    nodeStrokeWidth,
    nodes,
    width,
    x,
    y,
  ]);
  const viewRect = useMemo(() => {
    if (!viewBB) {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
    }
    const scaleX = width === 0 ? 0 : elementWidth / width;
    const scaleY = height === 0 ? 0 : elementHeight / height;
    return {
      x: (viewBB.x - x) * scaleX,
      y: (viewBB.y - y) * scaleY,
      width: viewBB.width * scaleX,
      height: viewBB.height * scaleY,
    };
  }, [elementHeight, elementWidth, height, viewBB, width, x, y]);
  const useCanvasNodeLayer =
    !nodeComponent &&
    (typeof nodeClassName !== "function"
      ? (nodeClassName ?? "").length === 0
      : false);

  const handleSvgClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const [localX, localY] = pointer(event);
    if (onSvgNodeClick) {
      const hitNode = projectedNodes.findLast(
        (node) =>
          localX >= node.left &&
          localX <= node.left + node.width &&
          localY >= node.top &&
          localY <= node.top + node.height,
      );
      if (hitNode) {
        onSvgNodeClick(event, hitNode.id);
      }
    }

    if (!onClick) {
      return;
    }

    const positionX = x + (localX / Math.max(elementWidth, 1)) * width;
    const positionY = y + (localY / Math.max(elementHeight, 1)) * height;
    onClick(event, { x: positionX, y: positionY });
  };

  return (
    <div
      style={{
        width: elementWidth,
        height: elementHeight,
        position: "relative",
      }}
    >
      {useCanvasNodeLayer ? (
        <MiniMapCanvasNodes
          borderRadius={nodeBorderRadius ?? 0}
          elementHeight={elementHeight}
          elementWidth={elementWidth}
          nodes={projectedNodes}
        />
      ) : (
        <svg
          width={elementWidth}
          height={elementHeight}
          viewBox={`0 0 ${elementWidth} ${elementHeight}`}
          role="img"
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <MiniMapNodes
            nodes={nodes.map((node, index) => ({
              ...node,
              id: node.id,
              position: {
                x: projectedNodes[index]?.left ?? 0,
                y: projectedNodes[index]?.top ?? 0,
              },
              width: projectedNodes[index]?.width ?? 0,
              height: projectedNodes[index]?.height ?? 0,
            }))}
            {...minimapNodesProps}
          />
        </svg>
      )}
      <svg
        width={elementWidth}
        height={elementHeight}
        viewBox={`0 0 ${elementWidth} ${elementHeight}`}
        role="img"
        ref={svgRef}
        data-testid="rf__minimap-viewport-layer"
        onClick={handleSvgClick}
        style={{ position: "absolute", inset: 0 }}
      >
        {viewBB && (
          <path
            className="react-flow__minimap-mask"
            d={`M${-offset},${-offset}h${elementWidth + offset * 2}v${elementHeight + offset * 2}h${-elementWidth - offset * 2}z
M${viewRect.x},${viewRect.y}h${viewRect.width}v${viewRect.height}h${-viewRect.width}z`}
            fill={maskColor}
            fillRule="evenodd"
            stroke={maskStrokeColor}
            strokeWidth={maskStrokeWidth}
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
}

type MiniMapCanvasNodesProps = {
  borderRadius: number;
  elementHeight: number;
  elementWidth: number;
  nodes: Array<ProjectedMiniMapNode>;
};

const MiniMapCanvasNodes = memo(function MiniMapCanvasNodes({
  borderRadius,
  elementHeight,
  elementWidth,
  nodes,
}: MiniMapCanvasNodesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const devicePixelRatio =
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    const targetWidth = Math.max(
      Math.round(elementWidth * devicePixelRatio),
      1,
    );
    const targetHeight = Math.max(
      Math.round(elementHeight * devicePixelRatio),
      1,
    );

    if (canvas.width !== targetWidth) {
      canvas.width = targetWidth;
    }
    if (canvas.height !== targetHeight) {
      canvas.height = targetHeight;
    }

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, elementWidth, elementHeight);

    for (const node of nodes) {
      if (node.width <= 0 || node.height <= 0) {
        continue;
      }

      drawRoundedRect(
        ctx,
        node.left,
        node.top,
        node.width,
        node.height,
        borderRadius,
      );
      ctx.fillStyle = node.color;
      ctx.fill();

      if (node.strokeWidth > 0) {
        ctx.lineWidth = node.strokeWidth;
        ctx.strokeStyle = node.strokeColor;
        ctx.stroke();
      }

      if (node.selected) {
        drawRoundedRect(
          ctx,
          node.left,
          node.top,
          node.width,
          node.height,
          borderRadius,
        );
        ctx.lineWidth = Math.max(node.strokeWidth, 1);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.stroke();
      }
    }
  }, [borderRadius, elementHeight, elementWidth, nodes]);

  return (
    <canvas
      ref={canvasRef}
      width={Math.max(elementWidth, 1)}
      height={Math.max(elementHeight, 1)}
      data-testid="rf__minimap-node-layer"
      data-node-count={nodes.length}
      style={{
        width: elementWidth,
        height: elementHeight,
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    />
  );
});

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  borderRadius: number,
) {
  const radius = Math.max(0, Math.min(borderRadius, width / 2, height / 2));
  ctx.beginPath();
  if (radius === 0) {
    ctx.rect(left, top, width, height);
    return;
  }
  ctx.moveTo(left + radius, top);
  ctx.lineTo(left + width - radius, top);
  ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
  ctx.lineTo(left + width, top + height - radius);
  ctx.quadraticCurveTo(
    left + width,
    top + height,
    left + width - radius,
    top + height,
  );
  ctx.lineTo(left + radius, top + height);
  ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
}

function getNodeAttributeFunction(
  func: string | ((node: Node) => string) | undefined,
): (node: Node) => string {
  if (typeof func === "function") {
    return func;
  }
  return () => func ?? "";
}
