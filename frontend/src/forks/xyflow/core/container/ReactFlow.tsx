import Background from "forks/xyflow/background/Background";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSettings } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { useReactFlow } from "../store";
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

const SCROLL_INIT = 5000;
const MAX_SCROLL_AMOUNT = 10000;

const ReactFlow = () => {
  const [snapToGrid] = localStorageFns.snapToGrid.hook();
  const showGridLines = useSettings((x) => !!x.gui.showGridLines);
  const ref = useRef();
  const [initialized, setInitialized] = useState(false);
  const [wrapperDimensions, setWrapperDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setWrapperDimensions({ width, height });
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    ref.current.scrollTop = SCROLL_INIT;
    ref.current.scrollLeft = SCROLL_INIT;
    console.log("ref.current.scrollHeight", ref.current.scrollHeight);
    console.log("ref.current.scrollTop", ref.current.scrollTop);
    setInitialized(true);
  }, []);

  return (
    <div
      style={wrapperStyle}
      className="react-flow setta-light dark:setta-dark"
      data-testid="rf__wrapper"
      ref={ref}
      onScroll={(e) => cancelOutScrolling(e, initialized)}
    >
      {/* This wrapper establishes the full scrollable area */}
      <div
        style={{
          position: "relative",
          height: `${MAX_SCROLL_AMOUNT}px`,
          width: `${MAX_SCROLL_AMOUNT}px`,
          top: `${SCROLL_INIT}px`,
          left: `${SCROLL_INIT}px`,
        }}
      >
        <FlowRenderer wrapperDimensions={wrapperDimensions}>
          <ViewportWrapper>
            <NodeRenderer />
          </ViewportWrapper>
        </FlowRenderer>
        {snapToGrid && showGridLines && <Background />}
      </div>
    </div>
  );
};

function cancelOutScrolling(e, initialized) {
  if (!initialized) {
    return;
  }
  const { d3Zoom, d3Selection, transform } = useReactFlow.getState();
  d3Zoom.translateBy(
    d3Selection,
    -(e.target.scrollLeft - SCROLL_INIT) / transform[2],
    -(e.target.scrollTop - SCROLL_INIT) / transform[2],
  );
  e.target.scrollTop = SCROLL_INIT;
  e.target.scrollLeft = SCROLL_INIT;
}

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
