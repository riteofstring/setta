import { zoomIdentity } from "d3-zoom";
import type { StoreApi } from "zustand";

import { useNodeInternals } from "models/info/nodeInternals";
import { useReactFlow } from ".";
import type { FitViewOptions, ReactFlowState } from "../types";
import {
  getD3Transition,
  getNodesBounds,
  getViewportForBounds,
} from "../utils/graph";

type InternalFitViewOptions = {
  initial?: boolean;
} & FitViewOptions;

export function fitView(
  get: StoreApi<ReactFlowState>["getState"],
  options: InternalFitViewOptions = {},
) {
  const { d3Zoom, d3Selection, fitViewOnInitDone, fitViewOnInit } = get();
  const isInitialFitView =
    options.initial && !fitViewOnInitDone && fitViewOnInit;
  const d3initialized = d3Zoom && d3Selection;

  if (d3initialized && (isInitialFitView || !options.initial)) {
    const nodes = useNodeInternals
      .getState()
      .getNodes()
      .filter((n) => {
        if (options.nodes?.length) {
          return options.nodes.some((optionNode) => optionNode.id === n.id);
        }

        return true;
      });

    const nodesInitialized = nodes.every((n) => n.width && n.height);

    if (nodes.length > 0 && nodesInitialized) {
      const { x, y, zoom } = getViewportForFitView(
        nodes,
        options.minZoom,
        options.maxZoom,
        options.padding,
      );

      const nextTransform = zoomIdentity.translate(x, y).scale(zoom);

      if (typeof options.duration === "number" && options.duration > 0) {
        d3Zoom.transform(
          getD3Transition(d3Selection, options.duration),
          nextTransform,
        );
      } else {
        d3Zoom.transform(d3Selection, nextTransform);
      }

      return true;
    }
  }

  return false;
}

export function getViewportForFitView(nodes, _minZoom, _maxZoom, padding) {
  const { width, height, minZoom, maxZoom } = useReactFlow.getState();
  const bounds = getNodesBounds(nodes);
  return getViewportForBounds(
    bounds,
    width,
    height,
    _minZoom ?? minZoom,
    _maxZoom ?? maxZoom,
    padding ?? 0.1,
  );
}
