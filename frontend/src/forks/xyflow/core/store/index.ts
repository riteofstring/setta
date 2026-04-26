import { Position } from "utils/generatedTypes";
import { subscribeWithSelector } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import type { CoordinateExtent, ReactFlowState } from "../types";
import { getActiveSectionsBounds } from "../utils/graph";
import initialState from "./initialState";

export const useReactFlow = createWithEqualityFn<ReactFlowState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,
    setNodesSelection: (selectedNodesCount, ignoreGrid = false) => {
      if (selectedNodesCount > 0) {
        set({ nodesSelectionDims: getActiveSectionsBounds(ignoreGrid) });
      }
    },
    shiftNodesSelection: (delta) => {
      set((state) => ({
        nodesSelectionDims: state.nodesSelectionDims
          ? {
              ...state.nodesSelectionDims,
              x: state.nodesSelectionDims.x + delta.x,
              y: state.nodesSelectionDims.y + delta.y,
            }
          : null,
      }));
    },
    setTranslateExtent: (translateExtent: CoordinateExtent) => {
      set({ translateExtent });
    },
    panBy: (delta: Position): boolean => {
      const { transform } = get();

      if (!delta.x && !delta.y) {
        return false;
      }
      set({
        transform: [
          transform[0] + delta.x,
          transform[1] + delta.y,
          transform[2],
        ],
      });
      return true;
    },
    cancelConnection: () => {
      set({
        connectionStartHandle: null,
        connectionEndHandle: null,
        connectionStatus: null,
      });
    },
  })),
);
