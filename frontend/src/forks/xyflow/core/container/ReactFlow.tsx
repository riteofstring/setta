import Background from "forks/xyflow/background/Background";
import { type CSSProperties } from "react";
import { useSettings } from "state/definitions";
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
  paddingTop: "1000px",
  paddingBottom:"1000px",
};

const ReactFlow = () => {
  const [snapToGrid] = localStorageFns.snapToGrid.hook();
  const showGridLines = useSettings((x) => !!x.gui.showGridLines);
  const divRef = useRef();

  useEffect(() => {
    setTimeout(() => {
      console.log("div scrollHeight", divRef.current.scrollHeight);
    }, 500);
  }, []);

  return (
    <div
      style={wrapperStyle}
      className="react-flow setta-light dark:setta-dark"
      data-testid="rf__wrapper"
      ref={divRef}
    >
      <FlowRenderer>
        <ViewportWrapper>
          <NodeRenderer />
        </ViewportWrapper>
      </FlowRenderer>
      {snapToGrid && showGridLines && <Background />}
    </div>
  );
};

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
