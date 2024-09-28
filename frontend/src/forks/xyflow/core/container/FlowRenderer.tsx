import { NodesSelectionWrapper } from "forks/xyflow/core/components/NodesSelection";
import { memo } from "react";
import { useReactFlow } from "../store";
import Pane from "./Pane";
import ZoomPane from "./ZoomPane";

const FlowRenderer = ({ children }) => {
  const selectionKeyPressed = useReactFlow((x) => x.selectionKeyPressed);
  const panOnDrag = true;

  return (
    <ZoomPane panOnDrag={!selectionKeyPressed && panOnDrag}>
      <Pane panOnDrag={panOnDrag} isSelecting={!!selectionKeyPressed}>
        {children}
        <NodesSelectionWrapper />
      </Pane>
    </ZoomPane>
  );
};

FlowRenderer.displayName = "FlowRenderer";

export default memo(FlowRenderer);
