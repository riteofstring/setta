import { memo, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";
import { useNodeInternals } from "../document/stores";
import { computeReadyToBeVisible } from "./fitView";
import { updateNodeDimensionsFromResizeObserver } from "./nodeInternalsActions";
import { useReactFlow } from "./store";
import { containerStyle } from "./styles";
import type { ReactFlowState } from "./types";
import { NodeWrapper } from "./wrapNode";
import { useWorkspaceHost } from "../workspaceHostContext";

const selector = (s: ReactFlowState) => s.panActivationKeyPressed;

const NodeRenderer = () => {
  const host = useWorkspaceHost();
  const panActivationKeyPressed = useReactFlow(selector);

  const nodeIds = useNodeInternals((x) => Array.from(x.x.keys()), shallow);
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  const resizeObserverRef = useRef<ResizeObserver | undefined>(undefined);
  const resizeObserver = useMemo(() => {
    if (typeof ResizeObserver === "undefined") {
      return null;
    }

    const observer = new ResizeObserver(
      (entries: Array<ResizeObserverEntry>) => {
        updateNodeDimensionsFromResizeObserver(host, entries);
      },
    );

    resizeObserverRef.current = observer;

    return observer;
  }, [host]);

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
