import { getNodes } from "state/actions/nodeInternals";
import { useProjectState, useSettings } from "state/definitions";
import { useReactFlow } from ".";
import { applyViewportTransform } from "../hooks/useViewportHelper";
import type { FitViewOptions, Node, ReactFlowState } from "../types";
import {
  getNodesBounds,
  getViewportForBounds,
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
  const d3Initialized = Boolean(d3Zoom && d3Selection);

  if (width <= 0 || height <= 0) {
    return false;
  }

  if (isInitialFitView || !options.initial) {
    const nodes = getFitViewNodes({
      nodeIds: options.nodes?.map((node) => node.id) ?? null,
      allowTopLevelFallback: !d3Initialized,
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

      applyViewportTransform({ x, y, zoom }, { duration: options.duration });

      return true;
    }
  }

  return false;
}

export function onFitViewHandler() {
  const { fitViewOnInit, fitViewOnInitDone } = useReactFlow.getState();
  if (fitViewOnInit && !fitViewOnInitDone) {
    return;
  }
  const duration = useSettings.getState().gui.transitionDuration;
  fitView({ duration });
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

function getFitViewNodes({
  nodeIds,
  allowTopLevelFallback,
}: {
  nodeIds: string[] | null;
  allowTopLevelFallback: boolean;
}): Node[] {
  const filteredNodes = getNodes().filter((node) =>
    nodeIds ? nodeIds.includes(node.id) : true,
  );
  const filteredNodesInitialized =
    filteredNodes.length > 0 &&
    filteredNodes.every((node) => node.width && node.height);
  if (filteredNodesInitialized || !allowTopLevelFallback) {
    return filteredNodes;
  }

  const topLevelSections =
    useProjectState.getState().projectConfig.topLevelSections;
  return Object.entries(topLevelSections).flatMap(([sectionId, layout]) => {
    if (nodeIds && !nodeIds.includes(sectionId)) {
      return [];
    }
    const x = typeof layout.x === "number" ? layout.x : 0;
    const y = typeof layout.y === "number" ? layout.y : 0;
    const width = typeof layout.w === "number" ? layout.w : 320;
    const height = typeof layout.h === "number" ? layout.h : 200;
    const zIndex = typeof layout.zIndex === "number" ? layout.zIndex : 0;
    return [
      {
        id: sectionId,
        position: { x, y },
        width,
        height,
        zIndex,
        tempZIndex: zIndex,
        type: "default",
      },
    ];
  });
}
