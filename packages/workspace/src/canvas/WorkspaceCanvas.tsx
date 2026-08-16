import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type UIEvent,
} from "react";
import { WorkspaceMenuLayer } from "../context-menu/WorkspaceMenuLayer";
import { SectionDndContext } from "../dnd/SectionDndContext";
import { useWorkspaceFocusScope } from "../focus/workspaceFocusScopes";
import { ResponsiveMiniMap } from "../minimap/ResponsiveMiniMap";
import { useWorkspaceFocusVisibility } from "../styles/workspaceFocusVisibility";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";
import { useWorkspaceHost } from "../workspaceHostContext";
import { useCanvasViewportDocumentSync } from "./documentViewportSync";
import FlowRenderer from "./FlowRenderer";
import { useCanvasKeyActivations } from "./keyActivations";
import NodeRenderer from "./NodeRenderer";
import { useWorkspaceOptions } from "./options";
import { useWorkspacePointerLocation } from "./pointerLocation";
import { getReactFlowStore } from "./store";
import Viewport from "./Viewport";
import { WorkspaceBackground } from "./WorkspaceBackground";

// The reference UiPage's full-size canvas wrapper (`relative h-full min-h-0 w-full min-w-0`): the
// minimap positions against this non-scrolling div and offsets itself by the overlay pane insets.
const outerWrapperStyle: CSSProperties = {
  position: "relative",
  height: "100%",
  width: "100%",
  minHeight: 0,
  minWidth: 0,
};

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
  const host = useWorkspaceHost();
  const ref = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const wrapperDimensions = useWrapperDivDimensions(ref);
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  const focusVisibilityRootRef = useRef<HTMLDivElement>(null);
  useWorkspaceFocusVisibility(focusVisibilityRootRef);
  useWorkspaceFocusScope("canvas", ref);
  useCanvasKeyActivations();
  useWorkspacePointerLocation();
  useCanvasViewportDocumentSync();

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = SCROLL_INIT;
      ref.current.scrollLeft = SCROLL_INIT;
    }
    setInitialized(true);
  }, []);

  const readyToRender =
    wrapperDimensions.height > 0 && wrapperDimensions.width > 0;
  const showMinimap = useWorkspaceOptions((x) => x.showMinimap);

  return (
    <div
      style={outerWrapperStyle}
      className={workspaceScopeClassName}
      role="region"
      aria-label="Workspace canvas"
      ref={focusVisibilityRootRef}
    >
      <div
        style={wrapperStyle}
        className={`${workspaceScopeClassName} react-flow`}
        ref={ref}
        onScroll={(e) => cancelOutScrolling(host, e, initialized)}
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
      {showMinimap && <ResponsiveMiniMap />}
      <WorkspaceMenuLayer />
    </div>
  );
}

function cancelOutScrolling(
  host: ReturnType<typeof useWorkspaceHost>,
  e: UIEvent<HTMLDivElement>,
  initialized: boolean,
) {
  if (!initialized) {
    return;
  }
  const { d3Zoom, d3Selection, transform } = getReactFlowStore(host).getState();
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
  const host = useWorkspaceHost();
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
        getReactFlowStore(host).setState({
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
  }, [host, ref]);

  return wrapperDimensions;
}
