import Background from "forks/xyflow/background/Background";
import { type CSSProperties } from "react";
import { localStorageFns } from "state/hooks/localStorage";
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

const ReactFlow = () => {
  const [snapToGrid] = localStorageFns.snapToGrid.hook();
  
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
      {snapToGrid && <Background />}
    </div>
  );
};

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
