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
import { useSceneGraphRendererRuntime } from "sceneGraphRenderer/useSceneGraphRendererRuntime";
import { useLocalStorage, useSettings } from "state/definitions";
import { useTabScope } from "utils/focusManager";
import { useReactFlow } from "../store";
import AgenticEdgeRenderer from "./AgenticEdgeRenderer";
import EdgeRenderer from "./EdgeRenderer";
import FlowRenderer from "./FlowRenderer";
import NodeRenderer from "./NodeRenderer";
import ViewportWrapper from "./Viewport";

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
  overflowAnchor: "none",
};

const SCROLL_INIT = 5000;

const ReactFlow = () => {
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);
  const showAgenticEdges = useLocalStorage((x) => x.showAgenticEdges);
  const showArgEdges = useLocalStorage((x) => x.showArgEdges);
  const darkMode = useLocalStorage((x) => x.darkMode);
  const sceneGraphRendererRuntime = useSceneGraphRendererRuntime();
  const showGridLines = useSettings((x) => !!x.gui.showGridLines);
  const wireColor = useSettings((x) => {
    // If the backend is running an older build, these fields can be missing.
    const gui = x.gui as unknown as {
      wireColor?: string;
      wireColorDarkMode?: string;
    };
    const light = gui.wireColor ?? "#41506c";
    const dark = gui.wireColorDarkMode ?? "#bac2d3";
    return darkMode ? dark : light;
  });
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
      ref.current.scrollTop = SCROLL_INIT;
      ref.current.scrollLeft = SCROLL_INIT;
    }
    setInitialized(true);
  }, []);

  const readyToRender =
    wrapperDimensions.height > 0 && wrapperDimensions.width > 0;
  const sceneGraphPerfLabels = sceneGraphRendererRuntime.perfLabels;

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
      data-scene-graph-renderer-enabled={
        sceneGraphPerfLabels.enabled ? "1" : "0"
      }
      data-scene-graph-renderer-backend-requested={
        sceneGraphPerfLabels.requestedBackend
      }
      data-scene-graph-renderer-backend-resolved={
        sceneGraphPerfLabels.resolvedBackend
      }
      data-scene-graph-renderer-resolution-reason={
        sceneGraphPerfLabels.resolutionReason
      }
      data-scene-graph-renderer-probe-status={sceneGraphPerfLabels.probeStatus}
      data-scene-graph-renderer-webgpu-available={
        sceneGraphPerfLabels.webgpuAvailable ? "1" : "0"
      }
      data-scene-graph-renderer-webgpu-reason={
        sceneGraphPerfLabels.webgpuReason ?? ""
      }
      data-scene-graph-renderer-webgl2-available={
        sceneGraphPerfLabels.webgl2Available ? "1" : "0"
      }
      data-scene-graph-renderer-webgl2-reason={
        sceneGraphPerfLabels.webgl2Reason ?? ""
      }
      data-scene-graph-renderer-software-fallback={
        sceneGraphPerfLabels.softwareFallbackDetected ? "1" : "0"
      }
      data-scene-graph-renderer-software-fallback-reasons={sceneGraphPerfLabels.softwareFallbackReasons.join(
        ",",
      )}
      data-scene-graph-renderer-dom-island-radius={String(
        sceneGraphPerfLabels.domIslandRadius,
      )}
      data-scene-graph-renderer-debug-overlay={
        sceneGraphPerfLabels.debugOverlay ? "1" : "0"
      }
    >
      {/* The purpose of this div is to allow us to set scrollTop and scrollLeft to a large initial value*/}
      {/* so that onScroll can be triggered in any direction. */}
      {/* That way, we can leverage the browser's scroll behavior in any direction, if we want to. */}
      <div
        style={{
          position: "relative",
          height: `${SCROLL_INIT}px`,
          width: `${SCROLL_INIT}px`,
          top: `${SCROLL_INIT}px`,
          left: `${SCROLL_INIT}px`,
        }}
      >
        <FlowRenderer wrapperDimensions={wrapperDimensions}>
          <ViewportWrapper>
            {readyToRender && (
              <>
                <EdgeRenderer />
                <AgenticEdgeRenderer />
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
  if (!initialized) {
    return;
  }
  const { d3Zoom, d3Selection, transform } = useReactFlow.getState();
  d3Zoom!.translateBy(
    d3Selection!,
    -(e.currentTarget.scrollLeft - SCROLL_INIT) / transform[2],
    -(e.currentTarget.scrollTop - SCROLL_INIT) / transform[2],
  );
  e.currentTarget.scrollTop = SCROLL_INIT;
  e.currentTarget.scrollLeft = SCROLL_INIT;
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

        // Set wrapper dimensions
        setWrapperDimensions({ width, height });

        // Set React Flow state
        useReactFlow.setState({
          width: width - overviewWidth - uiEditorWidth || 500,
          height: height || 500,
        });
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
