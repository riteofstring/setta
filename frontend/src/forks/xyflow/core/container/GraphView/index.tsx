import { memo } from "react";

import type { ReactFlowProps } from "../../types";
import FlowRenderer from "../FlowRenderer";
import NodeRenderer from "../NodeRenderer";
import ViewportWrapper from "../Viewport";

export type GraphViewProps = Omit<ReactFlowProps, "nodes"> &
  Required<
    Pick<
      ReactFlowProps,
      | "multiSelectionKeyCode"
      | "translateExtent"
      | "selectNodesOnDrag"
      | "noDragClassName"
      | "noDragClassName"
      | "noWheelClassName"
      | "noPanClassName"
    >
  >;

const GraphView = ({
  selectionOnDrag,
  selectionMode,
  multiSelectionKeyCode,
  zoomActivationKeyCode,
  elementsSelectable,
  selectNodesOnDrag,
  translateExtent,
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
      selectionOnDrag={selectionOnDrag}
      selectionMode={selectionMode}
      multiSelectionKeyCode={multiSelectionKeyCode}
      zoomActivationKeyCode={zoomActivationKeyCode}
      elementsSelectable={elementsSelectable}
      zoomOnScroll={zoomOnScroll}
      zoomOnPinch={zoomOnPinch}
      zoomOnDoubleClick={zoomOnDoubleClick}
      panOnScroll={panOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      panOnDrag={panOnDrag}
      translateExtent={translateExtent}
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
