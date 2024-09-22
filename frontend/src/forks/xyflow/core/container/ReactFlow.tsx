import { type CSSProperties } from "react";
import StoreUpdater from "../components/StoreUpdater";
import { infiniteExtent } from "../store/initialState";
import FlowRenderer from "./FlowRenderer";
import NodeRenderer from "./NodeRenderer";
import ViewportWrapper from "./Viewport";

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};

const ReactFlow = ({
  nodesDraggable,
  nodesFocusable,
  elementsSelectable,
  translateExtent = infiniteExtent,
  children,
  autoPanOnNodeDrag = true,
}) => {
  return (
    <div
      style={wrapperStyle}
      className="react-flow setta-light dark:setta-dark"
      data-testid="rf__wrapper"
    >
      <FlowRenderer>
        <ViewportWrapper>
          <NodeRenderer />
        </ViewportWrapper>
      </FlowRenderer>
      <StoreUpdater
        nodesDraggable={nodesDraggable}
        nodesFocusable={nodesFocusable}
        elementsSelectable={elementsSelectable}
        translateExtent={translateExtent}
        autoPanOnNodeDrag={autoPanOnNodeDrag}
      />
      {children}
    </div>
  );
};

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
