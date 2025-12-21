import { NodesSelectionWrapper } from "forks/xyflow/core/components/NodesSelection";
import _ from "lodash";
import { memo } from "react";
import { useAIFollow, useSettings } from "state/definitions";
import { useReactFlow } from "../store";
import Pane from "./Pane";
import ZoomPane from "./ZoomPane";

const FlowRenderer = ({
  children,
  wrapperDimensions,
}: {
  children: React.ReactNode;
  wrapperDimensions: { width: number; height: number };
}) => {
  const {
    panActivationKeyPressed,
    zoomActivationKeyPressed,
    selectionKeyPressed,
  } = useReactFlow((x) => {
    return {
      panActivationKeyPressed: x.panActivationKeyPressed,
      zoomActivationKeyPressed: x.zoomActivationKeyPressed,
      selectionKeyPressed: x.selectionKeyPressed,
    };
  }, _.isEqual);

  const aiFollowEnabled = useAIFollow((state) => state.enabled);

  const {
    panOnDrag,
    panOnScroll,
    panOnScrollSpeed,
    panOnScrollMode,
    zoomOnScroll,
    zoomOnPinch,
    zoomOnDoubleClick,
  } = useSettings((x) => {
    return {
      panOnDrag: x.gui.panOnDrag,
      panOnScroll: x.gui.panOnScroll,
      panOnScrollSpeed: x.gui.panOnScrollSpeed,
      panOnScrollMode: x.gui.panOnScrollMode,
      zoomOnScroll: x.gui.zoomOnScroll,
      zoomOnPinch: x.gui.zoomOnPinch,
      zoomOnDoubleClick: x.gui.zoomOnDoubleClick,
    };
  }, _.isEqual);

  const effectivePanOnDrag = !aiFollowEnabled && panOnDrag;
  const effectivePanOnScroll = !aiFollowEnabled && panOnScroll;
  const effectiveZoomOnScroll = !aiFollowEnabled && zoomOnScroll;
  const effectiveZoomOnPinch = !aiFollowEnabled && zoomOnPinch;
  const effectiveZoomOnDoubleClick = !aiFollowEnabled && zoomOnDoubleClick;

  return (
    <ZoomPane
      zoomOnScroll={effectiveZoomOnScroll}
      zoomOnPinch={effectiveZoomOnPinch}
      panOnScroll={effectivePanOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      zoomOnDoubleClick={effectiveZoomOnDoubleClick}
      panOnDrag={!selectionKeyPressed && effectivePanOnDrag}
      panActivationKeyPressed={panActivationKeyPressed}
      zoomActivationKeyPressed={zoomActivationKeyPressed}
      wrapperDimensions={wrapperDimensions}
    >
      <Pane panOnDrag={effectivePanOnDrag} isSelecting={!!selectionKeyPressed}>
        {children}
        <NodesSelectionWrapper />
      </Pane>
    </ZoomPane>
  );
};

FlowRenderer.displayName = "FlowRenderer";

export default memo(FlowRenderer);
