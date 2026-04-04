import { zoomIdentity } from "d3-zoom";

import { getNodes } from "state/actions/nodeInternals";
import { useSettings } from "state/definitions";
import { useReactFlow } from ".";
import type { FitViewOptions, ReactFlowState } from "../types";
import {
  getD3Transition,
  getNodesBounds,
  getViewportForBounds,
  hasActiveD3ViewportTarget,
} from "../utils/graph";

type InternalFitViewOptions = {
  initial?: boolean;
} & FitViewOptions;

export function fitView(options: InternalFitViewOptions = {}) {
  const {
    width,
    height,
    d3Zoom,
    d3Selection,
    fitViewOnInitDone,
    fitViewOnInit,
  } = useReactFlow.getState();

  const { minZoom, maxZoom, defaultZoomLevel } = useSettings.getState().gui;
  const resolvedMinZoom = options.minZoom ?? minZoom;
  let resolvedMaxZoom = options.maxZoom ?? maxZoom;
  if (options.initial) {
    resolvedMaxZoom = Math.min(resolvedMaxZoom, defaultZoomLevel);
  }
  if (resolvedMaxZoom < resolvedMinZoom) {
    resolvedMaxZoom = resolvedMinZoom;
  }

  const isInitialFitView =
    options.initial && !fitViewOnInitDone && fitViewOnInit;
  const d3initialized =
    d3Zoom &&
    d3Selection &&
    hasActiveD3ViewportTarget(d3Selection, useReactFlow.getState().domNode);

  if (!d3initialized) {
    return (
      useReactFlow.getState().viewportController?.fitView(options) ?? false
    );
  }

  if (isInitialFitView || !options.initial) {
    const nodes = getNodes().filter((n) => {
      if (options.nodes?.length) {
        return options.nodes.some((optionNode) => optionNode.id === n.id);
      }

      return true;
    });

    const nodesInitialized = nodes.every((n) => n.width && n.height);

    if (nodes.length > 0 && nodesInitialized) {
      const bounds = getNodesBounds(nodes);

      const { x, y, zoom } = getViewportForBounds(
        bounds,
        width,
        height,
        resolvedMinZoom,
        resolvedMaxZoom,
        options.padding ?? 0.1,
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

export function onFitViewHandler() {
  const { fitViewOnInit, viewportController } = useReactFlow.getState();
  if (fitViewOnInit && !viewportController) {
    return;
  }
  const duration = useSettings.getState().gui.transitionDuration;
  const didFit = fitView({ duration });
  if (!didFit) {
    return;
  }
  // Hack to set fitViewOnInit after transform is done.
  // If it gets set before the transform is done, then the
  // reactFitViewOnInitSubscriptionFn subscription will get
  // triggered and it will reset to fitViewOnInit
  setTimeout(
    () => useReactFlow.setState({ fitViewOnInit: true }),
    duration + 10,
  );
}

export function computeReadyToBeVisible(reactFlowState: ReactFlowState) {
  return !reactFlowState.fitViewOnInit || reactFlowState.fitViewOnInitDone;
}
