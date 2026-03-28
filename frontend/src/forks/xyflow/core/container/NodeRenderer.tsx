import { NodeWrapper } from "forks/xyflow/core/components/wrapNode";
import { useReactFlow } from "forks/xyflow/core/store";
import { memo, useEffect, useMemo } from "react";
import { useNodeInternals } from "state/definitions";
import { shallow } from "zustand/shallow";
import { computeReadyToBeVisible } from "../store/utils";
import { containerStyle } from "../styles";
import type { ReactFlowState } from "../types";
import {
  buildNodeRendererView,
  createNodeRendererResizeObserver,
} from "./nodeRendererView";

const selector = (s: ReactFlowState) => ({
  panActivationKeyPressed: s.panActivationKeyPressed,
});

const NodeRenderer = () => {
  const { panActivationKeyPressed } = useReactFlow(selector, shallow);
  // The getNodes selector has to use the "shallow" comparison
  // and not _.isEqual, otherwise it only re-renders every other update,
  // even though the MiniMap component uses the exact same hook and comparison fn
  // and rerenders on every update.
  // Tried debugging, could not figure out why.
  const nodeIds = useNodeInternals((x) => Array.from(x.x.keys()), shallow);
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  const resizeObserver = useMemo(createNodeRendererResizeObserver, []);
  const view = buildNodeRendererView({
    nodeIds,
    panActivationKeyPressed,
    readyToBeVisible,
    resizeObserver,
  });

  useEffect(() => {
    return () => resizeObserver?.disconnect();
  }, [resizeObserver]);

  return (
    <div className="react-flow__nodes" style={containerStyle}>
      {view.nodeWrappers.map((nodeWrapper) => (
        <NodeWrapper
          key={nodeWrapper.id}
          id={nodeWrapper.id}
          isDraggable={nodeWrapper.isDraggable}
          resizeObserver={nodeWrapper.resizeObserver}
          visibility={nodeWrapper.visibility}
        />
      ))}
    </div>
  );
};

NodeRenderer.displayName = "NodeRenderer";

export default memo(NodeRenderer);
