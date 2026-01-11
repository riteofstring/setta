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

  const isFollowTransitioning = useAIFollow(
    (state) => state.isFollowTransitioning,
  );

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

  return (
    <ZoomPane
      zoomOnScroll={!isFollowTransitioning && zoomOnScroll}
      zoomOnPinch={!isFollowTransitioning && zoomOnPinch}
      panOnScroll={!isFollowTransitioning && panOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      zoomOnDoubleClick={!isFollowTransitioning && zoomOnDoubleClick}
      panOnDrag={!selectionKeyPressed && !isFollowTransitioning && panOnDrag}
      panActivationKeyPressed={
        !isFollowTransitioning && panActivationKeyPressed
      }
      zoomActivationKeyPressed={
        !isFollowTransitioning && zoomActivationKeyPressed
      }
      wrapperDimensions={wrapperDimensions}
    >
      <Pane
        panOnDrag={!isFollowTransitioning && panOnDrag}
        isSelecting={!!selectionKeyPressed}
      >
        {children}
        <NodesSelectionWrapper />
      </Pane>
    </ZoomPane>
  );
};

FlowRenderer.displayName = "FlowRenderer";

export default memo(FlowRenderer);
