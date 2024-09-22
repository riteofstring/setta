import { memo } from "react";

import type { ReactFlowProps } from "../types";
import FlowRenderer from "./FlowRenderer";
import NodeRenderer from "./NodeRenderer";
import ViewportWrapper from "./Viewport";

export type GraphViewProps = Omit<ReactFlowProps, "nodes"> &
  Required<Pick<ReactFlowProps, "translateExtent">>;

const GraphView = ({
  elementsSelectable,
  translateExtent,
  preventScrolling,
  zoomOnScroll,
  zoomOnPinch,
  panOnScroll,
  panOnScrollSpeed,
  panOnScrollMode,
  zoomOnDoubleClick,
  panOnDrag,
}: GraphViewProps) => {
  return (
    <FlowRenderer
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
    >
      <ViewportWrapper>
        <NodeRenderer />
      </ViewportWrapper>
    </FlowRenderer>
  );
};

GraphView.displayName = "GraphView";

export default memo(GraphView);
