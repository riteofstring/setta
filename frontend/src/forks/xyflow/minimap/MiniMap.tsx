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
import {
  useActiveSectionUI,
  useLocalStorage,
  useNodeInternals,
} from "state/definitions";
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
import {
  MiniMapNodes,
  MiniMapNodesReactive,
  useMiniMapRenderableNodes,
} from "./MiniMapNodes";
import type { MiniMapNodesType, MiniMapProps } from "./types";

const defaultWidth = 200;
const defaultHeight = 150;

type MiniMapSelector = {
  viewBB: Rect;
  boundingRect: Rect;
};

type MiniMapViewportState = Pick<
  ReactFlowState,
  "height" | "transform" | "width"
>;

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
  viewBox: string;
  svgRef?: RefObject<SVGSVGElement>;
  maskPathRef?: RefObject<SVGPathElement>;
  onSvgClick?: (event: ReactMouseEvent<SVGSVGElement>) => void;
  onSvgNodeClick?: MiniMapNodesType["onClick"];
  maskPath: string | null;
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

function getMiniMapSelector(
  nodes: Node[],
  overviewWidth: number,
  uiEditorWidth: number,
) {
  return (s: MiniMapViewportState): MiniMapSelector => {
    const viewBB: Rect = getPaneRect(
      s as ReactFlowState,
      overviewWidth,
      uiEditorWidth,
    );

    return {
      viewBB,
      boundingRect:
        nodes.length > 0
          ? getBoundsOfRects(getNodesBounds(nodes), viewBB)
          : viewBB,
    };
  };
}

type MiniMapViewportMetricsArgs = {
  elementHeight: number;
  elementWidth: number;
  nodes: Node[];
  offsetScale: number;
  overviewWidth: number;
  reactFlowState: MiniMapViewportState;
  uiEditorWidth: number;
};

type MiniMapViewportMetrics = XYWidthHeightResult & {
  boundingRect: Rect;
  viewBB: Rect;
};

export function getMiniMapViewportMetrics({
  elementHeight,
  elementWidth,
  nodes,
  offsetScale,
  overviewWidth,
  reactFlowState,
  uiEditorWidth,
}: MiniMapViewportMetricsArgs): MiniMapViewportMetrics {
  const { boundingRect, viewBB } = getMiniMapSelector(
    nodes,
    overviewWidth,
    uiEditorWidth,
  )(reactFlowState);
  return {
    boundingRect,
    viewBB,
    ...getXYWidthHeight({
      boundingRect,
      elementHeight,
      elementWidth,
      offsetScale,
    }),
  };
}

export function getMiniMapViewBox(metrics: XYWidthHeightResult) {
  return `${metrics.x} ${metrics.y} ${metrics.width} ${metrics.height}`;
}

export function getMiniMapMaskPath(args: {
  height: number;
  maskRect: Rect | null;
  offset: number;
  width: number;
  x: number;
  y: number;
}) {
  const { height, maskRect, offset, width, x, y } = args;
  if (!maskRect) {
    return null;
  }
  return `M${x - offset},${y - offset}h${width + offset * 2}v${height + offset * 2}h${-width - offset * 2}z
M${maskRect.x},${maskRect.y}h${maskRect.width}v${maskRect.height}h${-maskRect.width}z`;
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
  const nodes = useMiniMapRenderableNodes();
  const nodesById = useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);
  const overviewWidth = useLocalStorage((x) => x.overviewTrueWidth);
  const uiEditorWidth = useLocalStorage((x) => x.uiEditorTrueWidth);
  const { width: paneWidth, height: paneHeight } = useReactFlow(
    (state) => ({
      width: state.width,
      height: state.height,
    }),
    shallow,
  );
  const elementWidth =
    typeof style?.width === "number" ? style.width : defaultWidth;
  const elementHeight =
    typeof style?.height === "number" ? style.height : defaultHeight;
  const maskPathRef = useRef<SVGPathElement>(null);
  const viewportMetrics = getMiniMapViewportMetrics({
    elementHeight,
    elementWidth,
    nodes,
    offsetScale,
    overviewWidth,
    reactFlowState: {
      height: paneHeight,
      transform: useReactFlow.getState().transform,
      width: paneWidth,
    },
    uiEditorWidth,
  });
  const viewScaleRef = useRef<number>(0);

  viewScaleRef.current = viewportMetrics.viewScale;

  useEffect(() => {
    const syncViewport = (transform: [number, number, number]) => {
      const nextMetrics = getMiniMapViewportMetrics({
        elementHeight,
        elementWidth,
        nodes,
        offsetScale,
        overviewWidth,
        reactFlowState: {
          height: useReactFlow.getState().height,
          transform,
          width: useReactFlow.getState().width,
        },
        uiEditorWidth,
      });
      viewScaleRef.current = nextMetrics.viewScale;
      svgRef.current?.setAttribute("viewBox", getMiniMapViewBox(nextMetrics));
      const nextMaskPath = getMiniMapMaskPath({
        height: nextMetrics.height,
        maskRect: nextMetrics.viewBB,
        offset: nextMetrics.offset,
        width: nextMetrics.width,
        x: nextMetrics.x,
        y: nextMetrics.y,
      });
      if (!maskPathRef.current || nextMaskPath === null) {
        return;
      }
      maskPathRef.current.setAttribute("d", nextMaskPath);
    };

    syncViewport(useReactFlow.getState().transform);

    return useReactFlow.subscribe((state) => state.transform, syncViewport);
  }, [
    elementHeight,
    elementWidth,
    nodes,
    offsetScale,
    overviewWidth,
    uiEditorWidth,
  ]);

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
        const node =
          nodesById.get(nodeId) ?? useNodeInternals.getState().x.get(nodeId);
        if (!node) {
          return;
        }
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
        viewBox={getMiniMapViewBox(viewportMetrics)}
        svgRef={svgRef}
        maskPathRef={maskPathRef}
        onSvgClick={onSvgClick}
        onSvgNodeClick={onSvgNodeClick}
        nodeColor={nodeColor}
        nodeStrokeColor={nodeStrokeColor}
        nodeBorderRadius={nodeBorderRadius}
        nodeClassName={nodeClassName}
        nodeStrokeWidth={nodeStrokeWidth}
        nodeComponent={nodeComponent}
        maskPath={getMiniMapMaskPath({
          height: viewportMetrics.height,
          maskRect: viewportMetrics.viewBB,
          offset: viewportMetrics.offset,
          width: viewportMetrics.width,
          x: viewportMetrics.x,
          y: viewportMetrics.y,
        })}
        maskColor={maskColor}
        maskStrokeColor={maskStrokeColor}
        maskStrokeWidth={maskStrokeWidth}
        nodes={nodes}
        enableSelectionSync
      />
    </Panel>
  );
}

MiniMap.displayName = "MiniMap";

export default memo(MiniMap);

function MiniMapSelectionSync({
  svgRef,
}: {
  svgRef?: RefObject<SVGSVGElement>;
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
  viewBox,
  svgRef,
  maskPathRef,
  onSvgClick,
  onSvgNodeClick,
  nodeColor,
  nodeStrokeColor,
  nodeBorderRadius,
  nodeClassName,
  nodeStrokeWidth,
  nodeComponent,
  maskPath,
  maskColor,
  maskStrokeColor,
  maskStrokeWidth,
  nodes,
  enableSelectionSync = false,
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
      viewBox={viewBox}
      role="img"
      ref={svgRef}
      onClick={onSvgClick}
    >
      {nodes ? (
        <MiniMapNodes nodes={nodes} {...minimapNodesProps} />
      ) : (
        <MiniMapNodesReactive {...minimapNodesProps} />
      )}
      {enableSelectionSync ? <MiniMapSelectionSync svgRef={svgRef} /> : null}
      {maskPath ? (
        <path
          ref={maskPathRef}
          className="react-flow__minimap-mask"
          d={maskPath}
          fill={maskColor}
          fillRule="evenodd"
          stroke={maskStrokeColor}
          strokeWidth={maskStrokeWidth}
          pointerEvents="none"
        />
      ) : null}
    </svg>
  );
}
