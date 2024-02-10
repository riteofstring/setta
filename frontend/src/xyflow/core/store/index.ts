import { zoomIdentity } from "d3-zoom";
import { useActiveSection } from "models/activeSection";
import { createWithEqualityFn } from "zustand/traditional";
import type { CoordinateExtent, ReactFlowState, XYPosition } from "../types";
import { getNodesBounds, getSectionRect } from "../utils/graph";
import initialState from "./initialState";

export const useReactFlow = createWithEqualityFn<ReactFlowState>(
  (set, get) => ({
    ...initialState,
    setNodesSelection: (selectedNodesCount) => {
      if (selectedNodesCount > 0) {
        const activeSectionIds = useActiveSection.getState().ids;
        const sections = activeSectionIds.map((sectionId) => {
          const { x, y, width, height } = getSectionRect(sectionId);
          return { position: { x, y }, width, height };
        });
        set({ nodesSelectionDims: getNodesBounds(sections) });
      }
    },
    shiftNodesSelection: (delta) => {
      set((state) => ({
        nodesSelectionDims: {
          ...state.nodesSelectionDims,
          x: state.nodesSelectionDims.x + delta.x,
          y: state.nodesSelectionDims.y + delta.y,
        },
      }));
    },
    setMinZoom: (minZoom: number) => {
      const { d3Zoom, maxZoom } = get();
      d3Zoom?.scaleExtent([minZoom, maxZoom]);

      set({ minZoom });
    },
    setMaxZoom: (maxZoom: number) => {
      const { d3Zoom, minZoom } = get();
      d3Zoom?.scaleExtent([minZoom, maxZoom]);

      set({ maxZoom });
    },
    setTranslateExtent: (translateExtent: CoordinateExtent) => {
      get().d3Zoom?.translateExtent(translateExtent);

      set({ translateExtent });
    },
    panBy: (delta: XYPosition): boolean => {
      const { transform, width, height, d3Zoom, d3Selection, translateExtent } =
        get();

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

      const constrainedTransform = d3Zoom?.constrain()(
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
    reset: () => set({ ...initialState }),
  }),
  Object.is,
);
