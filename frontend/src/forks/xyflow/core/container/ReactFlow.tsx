import { GpuProjectEdgeLayer } from "components/Pages/Project/GpuProjectEdgeLayer";
import Background from "forks/xyflow/background/Background";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
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
  const transform = useReactFlow((state) => state.transform, _.isEqual);
  const isConnecting = useGpuFlowViewportStore(
    (state) => state.connectionStartHandle !== null,
  );
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
  useSyncGpuViewportStore(ref, transform);
  useTabScope({
    scopeId: "canvas",
    order: 20,
    rootRef: ref as RefObject<HTMLElement>,
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
          {readyToRender && (
            <GpuProjectEdgeLayer
              showAgenticEdges={showAgenticEdges}
              showDataEdges={showArgEdges}
            />
          )}
          <ViewportWrapper>{readyToRender && <NodeRenderer />}</ViewportWrapper>
        </FlowRenderer>
        {snapToGrid && showGridLines && <Background />}
      </div>
    </div>
  );
};

function useSyncGpuViewportStore(
  ref: RefObject<HTMLDivElement | null>,
  transform: readonly [number, number, number],
) {
  const didInitialBridgeSync = useRef(false);
  const { defaultZoomLevel, maxZoom, minZoom } = useSettings(
    (state) => ({
      defaultZoomLevel: state.gui.defaultZoomLevel,
      maxZoom: state.gui.maxZoom,
      minZoom: state.gui.minZoom,
    }),
    _.isEqual,
  );

  useEffect(() => {
    const node = ref.current;
    gpuFlowViewportStore.getState().setDomNode(node);
    return () => {
      if (node) {
        gpuFlowViewportStore.getState().clearDomNode(node);
      }
    };
  }, [ref]);

  useEffect(() => {
    gpuFlowViewportStore.getState().setZoomBounds({
      defaultZoom: defaultZoomLevel,
      maxZoom,
      minZoom,
    });
  }, [defaultZoomLevel, maxZoom, minZoom]);

  useEffect(() => {
    if (!didInitialBridgeSync.current) {
      didInitialBridgeSync.current = true;
      const gpuTransform = gpuFlowViewportStore.getState().transform;
      if (!areViewportTuplesEqual(gpuTransform, transform)) {
        useReactFlow.setState({
          transform: [gpuTransform[0], gpuTransform[1], gpuTransform[2]],
        });
        return;
      }
    }
    gpuFlowViewportStore.getState().setTransform(transform);
  }, [transform]);

  useEffect(() => {
    return gpuFlowViewportStore.subscribe((state, previousState) => {
      if (areViewportTuplesEqual(state.transform, previousState.transform)) {
        return;
      }
      const reactFlowState = useReactFlow.getState();
      if (areViewportTuplesEqual(reactFlowState.transform, state.transform)) {
        return;
      }
      useReactFlow.setState({
        transform: [state.transform[0], state.transform[1], state.transform[2]],
      });
    });
  }, []);
}

function areViewportTuplesEqual(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function cancelOutScrolling(e: UIEvent<HTMLDivElement>, initialized: boolean) {
  if (!initialized) {
    return;
  }
  const { d3Zoom, d3Selection, transform } = useReactFlow.getState();
  if (!d3Zoom || !d3Selection) {
    return;
  }
  d3Zoom.translateBy(
    d3Selection,
    -(e.currentTarget.scrollLeft - SCROLL_INIT) / transform[2],
    -(e.currentTarget.scrollTop - SCROLL_INIT) / transform[2],
  );
  e.currentTarget.scrollTop = SCROLL_INIT;
  e.currentTarget.scrollLeft = SCROLL_INIT;
}

function useWrapperDivDimensions(ref: RefObject<HTMLDivElement | null>) {
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
        gpuFlowViewportStore.getState().setViewportSize({
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
