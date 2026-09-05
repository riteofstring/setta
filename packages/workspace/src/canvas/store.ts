import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { Position } from "../document/types";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import { getActiveSectionsBounds } from "./graph";
import type { CoordinateExtent, ReactFlowState, ReactFlowStore } from "./types";
import { EMPTY_VIEWPORT_INSETS } from "./viewportInsets";
import { getWorkspaceXyflowRuntime } from "./xyflow/workspaceXyflowRuntime";

const infiniteExtent: CoordinateExtent = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

export const initialCanvasState: ReactFlowStore = {
  width: 0,
  height: 0,
  viewportInsets: EMPTY_VIEWPORT_INSETS,
  transform: [0, 0, 1],
  translateExtent: infiniteExtent,
  nodesSelectionDims: null,
  userSelectionActive: false,
  userSelectionRect: null,
  domNode: null,
  paneDragging: false,
  isPanScrolling: false,
  viewportInteractionActive: false,
  nodeDragThreshold: 1,
  fitViewOnInit: false,
  fitViewOnInitDone: false,
  fitViewOnInitOptions: undefined,
  multiSelectionActive: false,
  selectionKeyPressed: false,
  zoomActivationKeyPressed: false,
  panActivationKeyPressed: false,
  autoPanOnNodeDrag: true,
};

function createReactFlowStore(host: WorkspaceHost) {
  return createStore<ReactFlowState>()(
    subscribeWithSelector((set) => ({
      ...initialCanvasState,
      setNodesSelection: (selectedNodesCount, ignoreGrid = false) => {
        set({
          nodesSelectionDims:
            selectedNodesCount > 1
              ? getActiveSectionsBounds(host, ignoreGrid)
              : null,
        });
      },
      shiftNodesSelection: (delta) => {
        set((state) => {
          if (state.nodesSelectionDims === null) {
            throw new Error(
              "Cannot shift a nodes selection that has no dimensions.",
            );
          }
          return {
            nodesSelectionDims: {
              ...state.nodesSelectionDims,
              x: state.nodesSelectionDims.x + delta.x,
              y: state.nodesSelectionDims.y + delta.y,
            },
          };
        });
      },
      panBy: (delta: Position): boolean => {
        if (!delta.x && !delta.y) {
          return false;
        }
        const xyflowRuntime = getWorkspaceXyflowRuntime(host);
        const viewport = xyflowRuntime.getViewport();
        if (!viewport) {
          return false;
        }
        void xyflowRuntime.setViewport({
          x: viewport.x + delta.x,
          y: viewport.y + delta.y,
          zoom: viewport.zoom,
        });
        return true;
      },
    })),
  );
}

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createReactFlowStore>
>();

export function getReactFlowStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createReactFlowStore(host);
  storesByHost.set(host, store);
  return store;
}

export function subscribeWorkspaceCanvasPanScrolling(
  host: WorkspaceHost,
  listener: (isPanScrolling: boolean) => void,
): () => void {
  return getReactFlowStore(host).subscribe(
    (state) => state.isPanScrolling,
    listener,
  );
}

export function useReactFlow<T>(
  selector: (state: ReactFlowState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getReactFlowStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}
