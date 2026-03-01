import { NodeWrapper } from "forks/xyflow/core/components/wrapNode";
import { useReactFlow } from "forks/xyflow/core/store";
import { memo, useEffect, useMemo, useRef } from "react";
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "state/actions/nodeInternals";
import { useNodeInternals } from "state/definitions";
import { shallow } from "zustand/shallow";
import { computeReadyToBeVisible } from "../store/utils";
import { containerStyle } from "../styles";
import type { ReactFlowState } from "../types";

const selector = (s: ReactFlowState) => ({
  panActivationKeyPressed: s.panActivationKeyPressed,
});

type NodeRendererProps = {
  renderSceneOnlySections: boolean;
  domIslandSectionIds: ReadonlySet<string>;
};

const NodeRenderer = ({
  renderSceneOnlySections,
  domIslandSectionIds,
}: NodeRendererProps) => {
  const { panActivationKeyPressed } = useReactFlow(selector, shallow);
  // The getNodes selector has to use the "shallow" comparison
  // and not _.isEqual, otherwise it only re-renders every other update,
  // even though the MiniMap component uses the exact same hook and comparison fn
  // and rerenders on every update.
  // Tried debugging, could not figure out why.
  const nodeIds = useNodeInternals((x) => Array.from(x.x.keys()), shallow);
  const renderedNodeIds = useMemo(() => {
    if (!renderSceneOnlySections) {
      return nodeIds;
    }
    return nodeIds.filter((nodeId) => domIslandSectionIds.has(nodeId));
  }, [domIslandSectionIds, nodeIds, renderSceneOnlySections]);
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  let nodeVisibility: "visible" | "hidden" = "hidden";
  if (readyToBeVisible || renderSceneOnlySections) {
    // In scene mode, non-island sections may stay unmounted by design, so fitView
    // readiness can remain pending and would otherwise hide the visible DOM islands.
    nodeVisibility = "visible";
  }
  const resizeObserverRef = useRef<ResizeObserver>();
  const resizeObserver = useMemo(() => {
    if (typeof ResizeObserver === "undefined") {
      return null;
    }

    const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const updates = getNodeUpdateInformation(entries, true);
      updateNodeDimensions(updates);
    });

    resizeObserverRef.current = observer;

    return observer;
  }, []);

  useEffect(() => {
    return () => {
      resizeObserverRef?.current?.disconnect();
    };
  }, []);

  return (
    <div className="react-flow__nodes" style={containerStyle}>
      {renderedNodeIds.map((nodeId) => (
        <NodeWrapper
          key={nodeId}
          id={nodeId}
          isDraggable={!panActivationKeyPressed}
          resizeObserver={resizeObserver}
          visibility={nodeVisibility}
        />
      ))}
    </div>
  );
};

NodeRenderer.displayName = "NodeRenderer";

export default memo(NodeRenderer);
