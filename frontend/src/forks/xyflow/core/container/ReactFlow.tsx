import Background from "forks/xyflow/background/Background";
import { type CSSProperties } from "react";
import { useSettings } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import FlowRenderer from "./FlowRenderer";
import NodeRenderer from "./NodeRenderer";
import ViewportWrapper from "./Viewport";
import useVisibleNodes from "../hooks/useVisibleNodes";

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};

const ReactFlow = () => {
  const [snapToGrid] = localStorageFns.snapToGrid.hook();
  const showGridLines = useSettings((x) => !!x.showGridLines);
  const nodes = useVisibleNodes();

  return (
    <div
      // style={wrapperStyle}
      className="react-flow setta-light dark:setta-dark"
      data-testid="rf__wrapper"
    >
      <FlowRenderer>
        {/* <ViewportWrapper> */}
          <NodeRenderer nodes={nodes}/>
        {/* </ViewportWrapper> */}
      </FlowRenderer>
      {snapToGrid && showGridLines && <Background />}
    </div>
  );
};

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
