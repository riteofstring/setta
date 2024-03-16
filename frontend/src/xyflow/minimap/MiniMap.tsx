/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import cc from "classcat";
import { pointer, select } from "d3-selection";
import type { D3ZoomEvent } from "d3-zoom";
import { zoom, zoomIdentity } from "d3-zoom";
import { useNodeInternals } from "models/info/nodeInternals";
import { usePanes } from "models/panes";
import type { MouseEvent } from "react";
import { memo, useEffect, useRef } from "react";
import {
  CoordinateExtent,
  getBoundsOfRects,
  getNodesBounds,
  Panel,
  Rect,
} from "xyflow/core";
import useVisibleNodes from "xyflow/core/hooks/useVisibleNodes";
import { useReactFlow } from "xyflow/core/store";
import { shallow } from "zustand/shallow";
import MiniMapNodes from "./MiniMapNodes";
import type { MiniMapProps } from "./types";

const defaultWidth = 200;
const defaultHeight = 150;

function getSelector(nodes, overviewWidth) {
  return (s) => {
    const viewBB: Rect = {
      x: (-s.transform[0] + overviewWidth) / s.transform[2],
      y: -s.transform[1] / s.transform[2],
      width: s.width / s.transform[2],
      height: s.height / s.transform[2],
    };

    return {
      viewBB,
      boundingRect:
        nodes.length > 0
          ? getBoundsOfRects(getNodesBounds(nodes), viewBB)
          : viewBB,
    };
  };
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
  const svg = useRef<SVGSVGElement>(null);
  const nodes = useVisibleNodes();
  const overviewWidth = usePanes((x) => x.trueWidth.overview);
  const { boundingRect, viewBB } = useReactFlow(
    getSelector(nodes, overviewWidth),
    shallow,
  );
  const elementWidth = (style?.width as number) ?? defaultWidth;
  const elementHeight = (style?.height as number) ?? defaultHeight;

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
  const viewScaleRef = useRef(0);

  viewScaleRef.current = viewScale;

  useEffect(() => {
    if (svg.current) {
      const selection = select(svg.current as Element);

      const zoomHandler = (event: D3ZoomEvent<SVGSVGElement, any>) => {
        const { transform, d3Selection, d3Zoom } = useReactFlow.getState();

        if (event.sourceEvent.type !== "wheel" || !d3Selection || !d3Zoom) {
          return;
        }

        const pinchDelta =
          -event.sourceEvent.deltaY *
          (event.sourceEvent.deltaMode === 1
            ? 0.05
            : event.sourceEvent.deltaMode
              ? 1
              : 0.002) *
          zoomStep;
        const zoom = transform[2] * Math.pow(2, pinchDelta);

        d3Zoom.scaleTo(d3Selection, zoom);
      };

      const panHandler = (event: D3ZoomEvent<HTMLDivElement, any>) => {
        const {
          transform,
          d3Selection,
          d3Zoom,
          translateExtent,
          width,
          height,
        } = useReactFlow.getState();

        if (event.sourceEvent.type !== "mousemove" || !d3Selection || !d3Zoom) {
          return;
        }

        // @TODO: how to calculate the correct next position? Math.max(1, transform[2]) is a workaround.
        const moveScale =
          viewScaleRef.current *
          Math.max(1, transform[2]) *
          (inversePan ? -1 : 1);
        const position = {
          x: transform[0] - event.sourceEvent.movementX * moveScale,
          y: transform[1] - event.sourceEvent.movementY * moveScale,
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

      const zoomAndPanHandler = zoom()
        // @ts-ignore
        .on("zoom", pannable ? panHandler : null)
        // @ts-ignore
        .on("zoom.wheel", zoomable ? zoomHandler : null);

      selection.call(zoomAndPanHandler);

      return () => {
        selection.on("zoom", null);
      };
    }
  }, [pannable, zoomable, inversePan, zoomStep]);

  const onSvgClick = onClick
    ? (event: MouseEvent) => {
        const rfCoord = pointer(event);
        onClick(event, { x: rfCoord[0], y: rfCoord[1] });
      }
    : undefined;

  const onSvgNodeClick = onNodeClick
    ? (event: MouseEvent, nodeId: string) => {
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
      <svg
        width={elementWidth}
        height={elementHeight}
        viewBox={`${x} ${y} ${width} ${height}`}
        role="img"
        ref={svg}
        onClick={onSvgClick}
      >
        <MiniMapNodes
          onClick={onSvgNodeClick}
          nodeColor={nodeColor}
          nodeStrokeColor={nodeStrokeColor}
          nodeBorderRadius={nodeBorderRadius}
          nodeClassName={nodeClassName}
          nodeStrokeWidth={nodeStrokeWidth}
          nodeComponent={nodeComponent}
        />
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
    </Panel>
  );
}

MiniMap.displayName = "MiniMap";

export default memo(MiniMap);
