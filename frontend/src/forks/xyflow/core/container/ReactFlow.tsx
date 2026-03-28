import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import Background from "forks/xyflow/background/Background";
import _ from "lodash";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type UIEvent,
} from "react";
import { useLocalStorage, useSettings } from "state/definitions";
import { useTabScope } from "utils/focusManager";
import { useReactFlow } from "../store";
import AgenticEdgeRenderer from "./AgenticEdgeRenderer";
import EdgeRenderer from "./EdgeRenderer";
import FlowRenderer from "./FlowRenderer";
import NodeRenderer from "./NodeRenderer";
import {
  buildReactFlowScrollPlan,
  buildReactFlowStoreDimensions,
  REACT_FLOW_SCROLL_INIT,
  resolveReactFlowWireColor,
  shouldRenderReactFlowContents,
  type ReactFlowGuiSettings,
} from "./reactFlowView";
import StateMachineEdgeRenderer from "./StateMachineEdgeRenderer";
import ViewportWrapper from "./Viewport";

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
  overflowAnchor: "none",
};

const ReactFlow = () => {
  const benchmark = useSettingsAllSettingsBenchmark();
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);
  const showAgenticEdges = useLocalStorage((x) => x.showAgenticEdges);
  const showArgEdges = useLocalStorage((x) => x.showArgEdges);
  const darkMode = useLocalStorage((x) => x.darkMode);
  const isConnecting = useReactFlow(
    (state) => state.connectionStartHandle !== null,
  );
  const showGridLines = useSettings((x) => !!x.gui.showGridLines);
  const wireColor = useSettings((x) =>
    resolveReactFlowWireColor({
      // If the backend is running an older build, these fields can be missing.
      gui: x.gui as ReactFlowGuiSettings,
      darkMode,
    }),
  );
  const ref = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const wrapperDimensions = useWrapperDivDimensions(ref);
  useTabScope({
    scopeId: "canvas",
    order: 20,
    rootRef: ref,
    behavior: "canvas",
  });

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = REACT_FLOW_SCROLL_INIT;
      ref.current.scrollLeft = REACT_FLOW_SCROLL_INIT;
    }
    setInitialized(true);
  }, []);

  const readyToRender = shouldRenderReactFlowContents(wrapperDimensions);

  return (
    <div
      style={
        {
          ...wrapperStyle,
          "--setta-wire-color": wireColor,
        } as CSSProperties
      }
      className="react-flow setta-light dark:setta-dark"
      ref={ref}
      onScroll={(e) => cancelOutScrolling(e, initialized)}
      data-tab-scope="canvas"
      data-show-agentic-edges={showAgenticEdges ? "true" : "false"}
      data-show-arg-edges={showArgEdges ? "true" : "false"}
      data-connecting={isConnecting ? "true" : "false"}
      data-settings-benchmark-stage={benchmark.active ? benchmark.stage : "off"}
    >
      {/* The purpose of this div is to allow us to set scrollTop and scrollLeft to a large initial value*/}
      {/* so that onScroll can be triggered in any direction. */}
      {/* That way, we can leverage the browser's scroll behavior in any direction, if we want to. */}
      <div
        style={{
          position: "relative",
          height: `${REACT_FLOW_SCROLL_INIT}px`,
          width: `${REACT_FLOW_SCROLL_INIT}px`,
          top: `${REACT_FLOW_SCROLL_INIT}px`,
          left: `${REACT_FLOW_SCROLL_INIT}px`,
        }}
      >
        <FlowRenderer wrapperDimensions={wrapperDimensions}>
          <ViewportWrapper>
            {readyToRender && (
              <>
                <EdgeRenderer />
                <AgenticEdgeRenderer />
                <StateMachineEdgeRenderer />
                <NodeRenderer />
              </>
            )}
          </ViewportWrapper>
        </FlowRenderer>
        {snapToGrid && showGridLines && <Background />}
      </div>
    </div>
  );
};

function cancelOutScrolling(e: UIEvent<HTMLDivElement>, initialized: boolean) {
  const { d3Zoom, d3Selection, transform } = useReactFlow.getState();
  const scrollPlan = buildReactFlowScrollPlan({
    initialized,
    scrollLeft: e.currentTarget.scrollLeft,
    scrollTop: e.currentTarget.scrollTop,
    transform,
  });

  if (!scrollPlan) {
    return;
  }

  d3Zoom!.translateBy(
    d3Selection!,
    scrollPlan.deltaX,
    scrollPlan.deltaY,
  );
  e.currentTarget.scrollTop = scrollPlan.resetScrollTop;
  e.currentTarget.scrollLeft = scrollPlan.resetScrollLeft;
}

function useWrapperDivDimensions(ref: RefObject<HTMLDivElement>) {
  const { overviewWidth, uiEditorWidth } = useLocalStorage(
    (x) => ({
      overviewWidth: x.overviewTrueWidth,
      uiEditorWidth: x.uiEditorTrueWidth,
    }),
    _.isEqual,
  );

  const [wrapperDimensions, setWrapperDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    let resizeObserver: ResizeObserver;

    if (ref.current) {
      resizeObserver = new ResizeObserver((entries) => {
        if (!entries[0]) {
          return;
        }

        const { width, height } = entries[0].contentRect;
        const nextWrapperDimensions = { width, height };

        // Set wrapper dimensions
        setWrapperDimensions(nextWrapperDimensions);

        // Set React Flow state
        useReactFlow.setState(
          buildReactFlowStoreDimensions({
            wrapperDimensions: nextWrapperDimensions,
            overviewWidth,
            uiEditorWidth,
          }),
        );
      });

      resizeObserver.observe(ref.current);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [overviewWidth, uiEditorWidth]);

  return wrapperDimensions;
}

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
