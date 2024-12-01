import { NodesSelectionWrapper } from "forks/xyflow/core/components/NodesSelection";
import _ from "lodash";
import { memo } from "react";
import { useSettings } from "state/definitions";
import { useReactFlow } from "../store";
import Pane from "./Pane";
import ZoomPane from "./ZoomPane";

const FlowRenderer = ({ children }) => {
  const {
    panOnDrag,
    panOnScroll,
    panOnScrollSpeed,
    panOnScrollMode,
    zoomOnScroll,
    zoomOnPinch,
    zoomOnDoubleClick,
    panActivationKeyPressed,
    zoomActivationKeyPressed,
    selectionKeyPressed,
  } = usePanZoomInfo();

  return (
    <ZoomPane
      zoomOnScroll={zoomOnScroll}
      zoomOnPinch={zoomOnPinch}
      panOnScroll={panOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      zoomOnDoubleClick={zoomOnDoubleClick}
      panOnDrag={!selectionKeyPressed && panOnDrag}
      panActivationKeyPressed={panActivationKeyPressed}
      zoomActivationKeyPressed={zoomActivationKeyPressed}
    >
      <Pane panOnDrag={panOnDrag} isSelecting={!!selectionKeyPressed}>
        {children}
        <NodesSelectionWrapper />
      </Pane>
    </ZoomPane>
  );
};

FlowRenderer.displayName = "FlowRenderer";

export default FlowRenderer;

function usePanZoomInfo() {
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

  return useSettings((x) => {
    return {
      panOnDrag: x.panOnDrag,
      panOnScroll: x.panOnScroll,
      panOnScrollSpeed: x.panOnScrollSpeed,
      panOnScrollMode: x.panOnScrollMode,
      zoomOnScroll: x.zoomOnScroll,
      zoomOnPinch: x.zoomOnPinch,
      zoomOnDoubleClick: x.zoomOnDoubleClick,
      panActivationKeyPressed,
      zoomActivationKeyPressed,
      selectionKeyPressed,
    };
  }, _.isEqual);
}
