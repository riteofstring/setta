import { zoomIdentity } from "d3-zoom";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { Position } from "../document/types";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import { getActiveSectionsBounds } from "./graph";
import type { CoordinateExtent, ReactFlowState, ReactFlowStore } from "./types";
import { EMPTY_VIEWPORT_INSETS } from "./viewportInsets";

export const infiniteExtent: CoordinateExtent = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

// The reference's connection/handle fields left with the excluded edge features.
export const initialCanvasState: ReactFlowStore = {
  width: 0,
  height: 0,
  viewportInsets: EMPTY_VIEWPORT_INSETS,
  transform: [0, 0, 1],
  d3Zoom: null,
  d3Selection: null,
  d3ZoomHandler: undefined,
  translateExtent: infiniteExtent,
  nodesSelectionDims: null,
  userSelectionActive: false,
  userSelectionRect: null,
  domNode: null,
  paneDragging: false,
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
    subscribeWithSelector((set, get) => ({
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
        const {
          transform,
          width,
          height,
          d3Zoom,
          d3Selection,
          translateExtent,
        } = get();

        if (!d3Zoom || !d3Selection || (!delta.x && !delta.y)) {
          return false;
        }

        const nextTransform = zoomIdentity
          .translate(transform[0] + delta.x, transform[1] + delta.y)
          .scale(transform[2]);

        const extent: CoordinateExtent = [
          [0, 0],
          [width, height],
        ];

        const constrainedTransform = d3Zoom.constrain()(
          nextTransform,
          extent,
          translateExtent,
        );
        d3Zoom.transform(d3Selection, constrainedTransform);

        const transformChanged =
          transform[0] !== constrainedTransform.x ||
          transform[1] !== constrainedTransform.y ||
          transform[2] !== constrainedTransform.k;

        return transformChanged;
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
