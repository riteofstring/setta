import _ from "lodash";
import { memo, type ReactNode } from "react";
import { NodesSelectionWrapper } from "./NodesSelection";
import { useWorkspaceOptions } from "./options";
import Pane from "./Pane";
import { useReactFlow } from "./store";
import ZoomPane from "./ZoomPane";

type FlowRendererProps = {
  children: ReactNode;
  wrapperDimensions: { width: number; height: number };
};

const FlowRenderer = ({ children, wrapperDimensions }: FlowRendererProps) => {
  const { zoomActivationKeyPressed, selectionKeyPressed } = useReactFlow(
    (x) => ({
      zoomActivationKeyPressed: x.zoomActivationKeyPressed,
      selectionKeyPressed: x.selectionKeyPressed,
    }),
    _.isEqual,
  );

  const {
    panOnDrag,
    panOnScroll,
    panOnScrollSpeed,
    panOnScrollMode,
    zoomOnScroll,
    zoomOnPinch,
    zoomOnDoubleClick,
  } = useWorkspaceOptions(
    (x) => ({
      panOnDrag: x.panOnDrag,
      panOnScroll: x.panOnScroll,
      panOnScrollSpeed: x.panOnScrollSpeed,
      panOnScrollMode: x.panOnScrollMode,
      zoomOnScroll: x.zoomOnScroll,
      zoomOnPinch: x.zoomOnPinch,
      zoomOnDoubleClick: x.zoomOnDoubleClick,
    }),
    _.isEqual,
  );

  return (
    <ZoomPane
      zoomOnScroll={zoomOnScroll}
      zoomOnPinch={zoomOnPinch}
      panOnScroll={panOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      zoomOnDoubleClick={zoomOnDoubleClick}
      panOnDrag={!selectionKeyPressed && panOnDrag}
      zoomActivationKeyPressed={zoomActivationKeyPressed}
      wrapperDimensions={wrapperDimensions}
    >
      <Pane isSelecting={selectionKeyPressed}>
        {children}
        <NodesSelectionWrapper />
      </Pane>
    </ZoomPane>
  );
};

FlowRenderer.displayName = "FlowRenderer";

export default memo(FlowRenderer);
