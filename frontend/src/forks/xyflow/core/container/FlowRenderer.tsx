import type { ReactNode } from "react";
import { memo } from "react";

import { NodesSelectionWrapper } from "forks/xyflow/core/components/NodesSelection";
import { useReactFlow } from "../store";
import { GraphViewProps } from "./GraphView";
import Pane from "./Pane";
import ZoomPane from "./ZoomPane";

export type FlowRendererProps = Omit<GraphViewProps, "arrowHeadColor"> & {
  children: ReactNode;
};

const FlowRenderer = ({
  children,
  elementsSelectable,
  zoomOnScroll,
  zoomOnPinch,
  panOnScroll,
  panOnScrollSpeed,
  panOnScrollMode,
  zoomOnDoubleClick,
  panOnDrag,
  translateExtent,
  preventScrolling,
}: FlowRendererProps) => {
  const selectionKeyPressed = useReactFlow((x) => x.selectionKeyPressed);

  return (
    <ZoomPane
      elementsSelectable={elementsSelectable}
      zoomOnScroll={zoomOnScroll}
      zoomOnPinch={zoomOnPinch}
      panOnScroll={panOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      zoomOnDoubleClick={zoomOnDoubleClick}
      panOnDrag={!selectionKeyPressed && panOnDrag}
      translateExtent={translateExtent}
      preventScrolling={preventScrolling}
    >
      <Pane panOnDrag={panOnDrag} isSelecting={!!selectionKeyPressed}>
        {children}
        <NodesSelectionWrapper />
      </Pane>
    </ZoomPane>
  );
};

FlowRenderer.displayName = "FlowRenderer";

export default memo(FlowRenderer);
