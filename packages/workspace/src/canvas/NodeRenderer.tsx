import { memo, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";
import { useNodeInternals } from "../document/stores";
import { computeReadyToBeVisible } from "./fitView";
import { updateNodeDimensionsFromResizeObserver } from "./nodeInternalsActions";
import { useReactFlow } from "./store";
import { containerStyle } from "./styles";
import type { ReactFlowState } from "./types";
import { NodeWrapper } from "./wrapNode";

const selector = (s: ReactFlowState) => s.panActivationKeyPressed;

const NodeRenderer = () => {
  const panActivationKeyPressed = useReactFlow(selector);
  // The getNodes selector has to use the "shallow" comparison
  // and not _.isEqual, otherwise it only re-renders every other update,
  // even though the MiniMap component uses the exact same hook and comparison fn
  // and rerenders on every update.
  // Tried debugging, could not figure out why.
  const nodeIds = useNodeInternals((x) => Array.from(x.x.keys()), shallow);
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  const resizeObserverRef = useRef<ResizeObserver | undefined>(undefined);
  const resizeObserver = useMemo(() => {
    if (typeof ResizeObserver === "undefined") {
      return null;
    }

    const observer = new ResizeObserver(
      (entries: Array<ResizeObserverEntry>) => {
        updateNodeDimensionsFromResizeObserver(entries);
      },
    );

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
      {nodeIds.map((nodeId) => (
        <NodeWrapper
          key={nodeId}
          id={nodeId}
          isDraggable={!panActivationKeyPressed}
          resizeObserver={resizeObserver}
          visibility={readyToBeVisible ? "visible" : "hidden"}
        />
      ))}
    </div>
  );
};

NodeRenderer.displayName = "NodeRenderer";

export default memo(NodeRenderer);
