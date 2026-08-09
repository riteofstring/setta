import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type UIEvent,
} from "react";
import { SectionDndContext } from "../dnd/SectionDndContext";
import { WORKSPACE_SCOPE_CLASS_NAME } from "../styles/workspaceScope";
import { useCanvasViewportDocumentSync } from "./documentViewportSync";
import FlowRenderer from "./FlowRenderer";
import { useCanvasKeyActivations } from "./keyActivations";
import NodeRenderer from "./NodeRenderer";
import { useReactFlow } from "./store";
import Viewport from "./Viewport";
import { WorkspaceBackground } from "./WorkspaceBackground";

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
  overflowAnchor: "none",
};

const SCROLL_INIT = 5000;

// The package composition of the reference's `<ReactFlow />`: edge renderers and app chrome hooks
// stay with their excluded features; the reference canvas background is part of this visible slice.
// Section bodies come from the host's registered section kinds, not from canvas props.
export function WorkspaceCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const wrapperDimensions = useWrapperDivDimensions(ref);
  useCanvasKeyActivations();
  useCanvasViewportDocumentSync();

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = SCROLL_INIT;
      ref.current.scrollLeft = SCROLL_INIT;
    }
    setInitialized(true);
  }, []);

  const readyToRender = wrapperDimensions.height > 0 && wrapperDimensions.width > 0;

  return (
    <div
      style={wrapperStyle}
      className={`${WORKSPACE_SCOPE_CLASS_NAME} react-flow`}
      ref={ref}
      onScroll={(e) => cancelOutScrolling(e, initialized)}
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
        <SectionDndContext>
          <FlowRenderer wrapperDimensions={wrapperDimensions}>
            <Viewport>{readyToRender && <NodeRenderer />}</Viewport>
          </FlowRenderer>
        </SectionDndContext>
        <WorkspaceBackground />
      </div>
    </div>
  );
}

function cancelOutScrolling(e: UIEvent<HTMLDivElement>, initialized: boolean) {
  if (!initialized) {
    return;
  }
  const { d3Zoom, d3Selection, transform } = useReactFlow.getState();
  if (!d3Zoom || !d3Selection) {
    throw new Error("Canvas scrolled before the zoom pane initialized.");
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

        // Set canvas store state
        useReactFlow.setState({
          width: width || 500,
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
  }, [ref]);

  return wrapperDimensions;
}
