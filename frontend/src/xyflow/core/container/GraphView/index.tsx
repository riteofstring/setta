import { memo } from "react";

import type { ReactFlowProps } from "../../types";
import FlowRenderer from "../FlowRenderer";
import NodeRenderer from "../NodeRenderer";
import ViewportWrapper from "../Viewport";

export type GraphViewProps = Omit<ReactFlowProps, "nodes"> &
  Required<
    Pick<
      ReactFlowProps,
      | "selectionKeyCode"
      | "multiSelectionKeyCode"
      | "translateExtent"
      | "minZoom"
      | "maxZoom"
      | "selectNodesOnDrag"
      | "noDragClassName"
      | "noDragClassName"
      | "noWheelClassName"
      | "noPanClassName"
      | "defaultViewport"
    >
  >;

const GraphView = ({
  selectionKeyCode,
  selectionOnDrag,
  selectionMode,
  multiSelectionKeyCode,
  panActivationKeyCode,
  zoomActivationKeyCode,
  elementsSelectable,
  selectNodesOnDrag,
  defaultViewport,
  translateExtent,
  minZoom,
  maxZoom,
  preventScrolling,
  zoomOnScroll,
  zoomOnPinch,
  panOnScroll,
  panOnScrollSpeed,
  panOnScrollMode,
  zoomOnDoubleClick,
  panOnDrag,
  noDragClassName,
  noWheelClassName,
  noPanClassName,
}: GraphViewProps) => {
  return (
    <FlowRenderer
      selectionKeyCode={selectionKeyCode}
      selectionOnDrag={selectionOnDrag}
      selectionMode={selectionMode}
      multiSelectionKeyCode={multiSelectionKeyCode}
      panActivationKeyCode={panActivationKeyCode}
      zoomActivationKeyCode={zoomActivationKeyCode}
      elementsSelectable={elementsSelectable}
      zoomOnScroll={zoomOnScroll}
      zoomOnPinch={zoomOnPinch}
      zoomOnDoubleClick={zoomOnDoubleClick}
      panOnScroll={panOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      panOnDrag={panOnDrag}
      defaultViewport={defaultViewport}
      translateExtent={translateExtent}
      minZoom={minZoom}
      maxZoom={maxZoom}
      preventScrolling={preventScrolling}
      noDragClassName={noDragClassName}
      noWheelClassName={noWheelClassName}
      noPanClassName={noPanClassName}
    >
      <ViewportWrapper>
        <NodeRenderer
          selectNodesOnDrag={selectNodesOnDrag}
          noPanClassName={noPanClassName}
          noDragClassName={noDragClassName}
        />
      </ViewportWrapper>
    </FlowRenderer>
  );
};

GraphView.displayName = "GraphView";

export default memo(GraphView);
