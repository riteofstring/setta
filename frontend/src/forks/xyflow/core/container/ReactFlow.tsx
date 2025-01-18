import Background from "forks/xyflow/background/Background";
import { useEffect, useRef, type CSSProperties } from "react";
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
};

const ReactFlow = () => {
  const [snapToGrid] = localStorageFns.snapToGrid.hook();
  const showGridLines = useSettings((x) => !!x.gui.showGridLines);
  const ref = useRef();

  useEffect(() => {
    console.log("scrollHeight", ref.current.scrollHeight);
    console.log("scrollTop", ref.current.scrollTop);
    ref.current.scrollTop = 5000;
  }, []);

  return (
    <div
      style={wrapperStyle}
      className="react-flow setta-light dark:setta-dark"
      data-testid="rf__wrapper"
      ref={ref}
      onScroll={cancelOutScrolling}
    >
      {/* This wrapper establishes the full scrollable area */}
      <div
        style={{ position: "relative", height: "10000px", width: "10000px" }}
      >
        {/* This provides the actual background dimensions */}
        <div
          className="absolute"
          style={{
            height: "10000px",
            width: "10000px",
            top: "-5000px",
            left: "-5000px",
          }}
        />
        {/* This ensures Flow components are positioned correctly relative to the viewport */}
        <div style={{ position: "fixed", inset: 0 }}>
          <FlowRenderer>
            <ViewportWrapper>
              <NodeRenderer />
            </ViewportWrapper>
          </FlowRenderer>
          {snapToGrid && showGridLines && <Background />}
        </div>
      </div>
    </div>
  );
};

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;

function cancelOutScrolling(e) {
  console.log("e.target.scrollTop", e.target.scrollTop);
  // if (e.target.scrollTop > 0 || e.target.scrollLeft) {
  //   const { d3Zoom, d3Selection, transform } = useReactFlow.getState();
  //   d3Zoom.translateBy(
  //     d3Selection,
  //     -e.target.scrollLeft / transform[2],
  //     -e.target.scrollTop / transform[2],
  //   );
  //   e.target.scrollTop = 0;
  //   e.target.scrollLeft = 0;
  // }
}
