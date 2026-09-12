import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type UIEvent,
} from "react";
import { WorkspaceMenuLayer } from "../context-menu/WorkspaceMenuLayer";
import { SectionDndContext } from "../dnd/SectionDndContext";
import { getNodeInternalsStore } from "../document/stores";
import { useWorkspaceFocusScope } from "../focus/workspaceFocusScopes";
import { WorkspaceGraphProvider } from "../graph/WorkspaceGraphContext";
import { ResponsiveMiniMap } from "../minimap/ResponsiveMiniMap";
import { useWorkspaceFocusVisibility } from "../styles/workspaceFocusVisibility";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceHost } from "../workspaceHost";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";
import {
  assertWorkspaceCanvasConfiguration,
  type WorkspaceCanvasConfiguration,
} from "./configuration";
import { useCanvasViewportDocumentSync } from "./documentViewportSync";
import { useCanvasKeyActivations } from "./keyActivations";
import {
  maybeCompleteInitialFitView,
  raiseTempZIndex,
  updateNodeDimensionsFromXyflow,
  updateNodePositionsAndCommit,
} from "./nodeInternalsActions";
import { getWorkspaceOptionsStore, useWorkspaceOptions } from "./options";
import { useWorkspacePointerLocation } from "./pointerLocation";
import { getReactFlowStore } from "./store";
import type { NodeDragItem } from "./types";
import { WorkspaceXyflowAdapter } from "./xyflow/WorkspaceXyflowAdapter";
import { getWorkspaceXyflowRuntime } from "./xyflow/workspaceXyflowRuntime";
import type { WorkspaceXyflowNodeDimensions } from "./xyflow/types";

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
  userSelect: "none",
  overflowAnchor: "none",
};

const SCROLL_INIT = 5000;

export type WorkspaceCanvasProps = Readonly<{
  configuration?: WorkspaceCanvasConfiguration;
}>;

export function WorkspaceCanvas({ configuration }: WorkspaceCanvasProps = {}) {
  assertWorkspaceCanvasConfiguration(configuration);
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
  const { defaultViewport, onViewportChange } = useCanvasViewportDocumentSync();

  const handleXyflowRuntimeReady = useCallback(() => {
    maybeCompleteInitialFitView(host);
  }, [host]);

  const handleXyflowNodeDimensionsChange = useCallback(
    (dimensions: ReadonlyArray<WorkspaceXyflowNodeDimensions>) => {
      updateNodeDimensionsFromXyflow(host, dimensions);
    },
    [host],
  );

  const handleXyflowDragCommit = useCallback(
    (items: ReadonlyArray<NodeDragItem>) => {
      commitWorkspaceXyflowNodeDrag(host, items);
    },
    [host],
  );

  const handleXyflowDragStart = useCallback(
    (items: ReadonlyArray<NodeDragItem>) => {
      raiseTempZIndex(
        host,
        items.map((item) => ({ id: item.id })),
      );
    },
    [host],
  );

  useLayoutEffect(() => {
    const root = focusVisibilityRootRef.current;
    if (!root) {
      throw new Error("Workspace canvas root did not mount.");
    }
    return registerWorkspaceHostElement(host, root);
  }, [host]);

  useLayoutEffect(() => {
    const domNode = ref.current;
    if (!domNode) {
      throw new Error("Workspace canvas scroll shell did not mount.");
    }
    getReactFlowStore(host).setState({ domNode });
    return () => {
      if (getReactFlowStore(host).getState().domNode === domNode) {
        getReactFlowStore(host).setState({ domNode: null });
      }
    };
  }, [host]);

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
    <WorkspaceGraphProvider configuration={configuration?.graph}>
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
          onScroll={(e) => cancelWorkspaceCanvasScrolling(host, e, initialized)}
        >
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
              <WorkspaceXyflowAdapter
                externalDrop={configuration?.externalDrop}
                onDragCommit={handleXyflowDragCommit}
                onDragStart={handleXyflowDragStart}
                onNodeDimensionsChange={handleXyflowNodeDimensionsChange}
                onRuntimeReady={handleXyflowRuntimeReady}
                onViewportChange={onViewportChange}
                renderNodes={readyToRender}
                defaultViewport={defaultViewport}
                wrapperDimensions={wrapperDimensions}
              />
            </SectionDndContext>
          </div>
        </div>
        {showMinimap && <ResponsiveMiniMap />}
        <WorkspaceMenuLayer />
      </div>
    </WorkspaceGraphProvider>
  );
}

export function cancelWorkspaceCanvasScrolling(
  host: WorkspaceHost,
  e: UIEvent<HTMLDivElement>,
  initialized: boolean,
) {
  if (!initialized) {
    return;
  }
  const { currentTarget } = e;
  const scrollLeft = currentTarget.scrollLeft - SCROLL_INIT;
  const scrollTop = currentTarget.scrollTop - SCROLL_INIT;
  const xyflowRuntime = getWorkspaceXyflowRuntime(host);
  const viewport = xyflowRuntime.getViewport();
  if (viewport && (scrollLeft || scrollTop)) {
    void xyflowRuntime.setViewport({
      x: viewport.x - scrollLeft,
      y: viewport.y - scrollTop,
      zoom: viewport.zoom,
    });
  }
  currentTarget.scrollTop = SCROLL_INIT;
  currentTarget.scrollLeft = SCROLL_INIT;
}

export function commitWorkspaceXyflowNodeDrag(
  host: WorkspaceHost,
  items: ReadonlyArray<NodeDragItem>,
): void {
  const { snapGrid, snapToGrid } = getWorkspaceOptionsStore(host).getState();
  const currentNodes = getNodeInternalsStore(host).getState().x;
  const nodeItems = items.flatMap((item) => {
    const currentNode = currentNodes.get(item.id);
    if (!currentNode) {
      return [];
    }
    const position = snapToGrid
      ? {
          x: snapGrid[0] * Math.round(item.position.x / snapGrid[0]),
          y: snapGrid[1] * Math.round(item.position.y / snapGrid[1]),
        }
      : item.position;
    return [
      {
        ...item,
        position,
      },
    ];
  });
  if (nodeItems.length > 0) {
    updateNodePositionsAndCommit(host, nodeItems, {
      normalizeZIndices: nodeItems.map((item) => item.id),
    });
  }
}

function useWrapperDivDimensions(ref: RefObject<HTMLDivElement | null>) {
  const host = useWorkspaceHost();
  const [wrapperDimensions, setWrapperDimensions] = useState({
    width: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const wrapper = ref.current;
    if (!wrapper) {
      return;
    }

    const commitDimensions = (width: number, height: number) => {
      setWrapperDimensions({ width, height });
      getReactFlowStore(host).setState({
        width: width || 500,
        height: height || 500,
      });
    };

    const initialBounds = wrapper.getBoundingClientRect();
    commitDimensions(initialBounds.width, initialBounds.height);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      commitDimensions(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(wrapper);

    return () => {
      resizeObserver.disconnect();
    };
  }, [host, ref]);

  return wrapperDimensions;
}
