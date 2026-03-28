import type { CSSProperties } from "react";
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "state/actions/nodeInternals";

export type BuildNodeRendererViewArgs = {
  nodeIds: string[];
  panActivationKeyPressed: boolean;
  readyToBeVisible: boolean;
  resizeObserver: ResizeObserver | null;
};

export type NodeWrapperView = {
  id: string;
  isDraggable: boolean;
  resizeObserver: ResizeObserver | null;
  visibility: CSSProperties["visibility"];
};

export type NodeRendererView = {
  nodeWrappers: NodeWrapperView[];
};

export function buildNodeRendererView({
  nodeIds,
  panActivationKeyPressed,
  readyToBeVisible,
  resizeObserver,
}: BuildNodeRendererViewArgs): NodeRendererView {
  const visibility: CSSProperties["visibility"] = readyToBeVisible
    ? "visible"
    : "hidden";
  const isDraggable = !panActivationKeyPressed;

  return {
    nodeWrappers: nodeIds.map((nodeId) => ({
      id: nodeId,
      isDraggable,
      resizeObserver,
      visibility,
    })),
  };
}

export function createNodeRendererResizeObserver(): ResizeObserver | null {
  if (typeof ResizeObserver === "undefined") {
    return null;
  }

  return new ResizeObserver((entries: ResizeObserverEntry[]) => {
    const updates = getNodeUpdateInformation(entries, true);
    updateNodeDimensions(updates);
  });
}
