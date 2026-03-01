import cc from "classcat";
import { pointer, select } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  memo,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { getNodes } from "state/actions/nodeInternals";
import { useLocalStorage, useNodeInternals } from "state/definitions";
import { shallow } from "zustand/shallow";
import Panel from "../core/components/Panel";
import type {
  CoordinateExtent,
  Node,
  ReactFlowState,
  Rect,
} from "../core/types";
import { getBoundsOfRects, getWheelDelta } from "../core/utils";
import { getNodesBounds, getPaneRect } from "../core/utils/graph";
import { MiniMapNodes, MiniMapNodesReactive } from "./MiniMapNodes";
import type { MiniMapNodesType, MiniMapProps } from "./types";

const defaultWidth = 200;
const defaultHeight = 150;

type MiniMapSelector = {
  viewBB: Rect;
  boundingRect: Rect;
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
  svgRef: RefObject<SVGSVGElement>;
  onSvgClick?: (event: ReactMouseEvent<SVGSVGElement>) => void;
  onSvgNodeClick?: MiniMapNodesType["onClick"];
  offset: number;
  viewBB: Rect;
  maskColor: string;
  maskStrokeColor: string;
  maskStrokeWidth: number;
  nodes: Node[] | null;
};

function getSelector(
  nodes: Node[],
  overviewWidth: number,
  uiEditorWidth: number,
) {
  return (s: ReactFlowState): MiniMapSelector => {
    const viewBB: Rect = getPaneRect(s, overviewWidth, uiEditorWidth);

    return {
      viewBB,
      boundingRect:
        nodes.length > 0
          ? getBoundsOfRects(getNodesBounds(nodes), viewBB)
          : viewBB,
    };
  };
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
  const { boundingRect, viewBB } = useReactFlow(
    getSelector(nodes, overviewWidth, uiEditorWidth),
    shallow,
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

  const onSvgClick = onClick
    ? (event: ReactMouseEvent<SVGSVGElement>) => {
        const rfCoord = pointer(event);
        onClick(event, {
          x: rfCoord[0] - useLocalStorage.getState().overviewTrueWidth,
          y: rfCoord[1],
        });
      }
    : undefined;

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
        onSvgClick={onSvgClick}
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
        nodes={null}
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
}: MinimapSvgProps) {
  const minimapNodesProps: MiniMapNodesType = {
    onClick: onSvgNodeClick,
    nodeColor,
    nodeStrokeColor,
    nodeBorderRadius,
    nodeClassName,
    nodeStrokeWidth,
    nodeComponent,
  };

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
      {viewBB && (
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
      )}
    </svg>
  );
}
