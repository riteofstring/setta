import { type CSSProperties } from "react";
import { useReactFlowTabInterceptor } from "utils/tabbingLogic";
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

const ReactFlow = ({ children }) => {
  const { containerRef, onKeyDown, onKeyUp, onFocus } =
    useReactFlowTabInterceptor();

  return (
    <div
      style={wrapperStyle}
      className="react-flow setta-light dark:setta-dark"
      data-testid="rf__wrapper"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocus={onFocus}
      onBlur={onKeyUp}
      ref={containerRef}
    >
      <FlowRenderer>
        <ViewportWrapper>
          <NodeRenderer />
        </ViewportWrapper>
      </FlowRenderer>
      {children}
    </div>
  );
};

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
