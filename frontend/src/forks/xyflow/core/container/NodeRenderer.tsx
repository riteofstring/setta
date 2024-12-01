import { NodeWrapper } from "forks/xyflow/core/components/wrapNode";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { memo, useEffect, useMemo, useRef } from "react";
import { getNodes, updateNodeDimensions } from "state/actions/nodeInternals";
import { useActiveSection, useNodeInternals } from "state/definitions";
import { shallow } from "zustand/shallow";
import { containerStyle } from "../styles";
import type { ReactFlowState } from "../types";

const selector = (s: ReactFlowState) => ({
  nodesDraggable: s.nodesDraggable,
  nodesFocusable: s.nodesFocusable,
  elementsSelectable: s.elementsSelectable,
  panActivationKeyPressed: s.panActivationKeyPressed,
});

const NodeRenderer = ({}) => {
  const {
    nodesDraggable,
    nodesFocusable,
    elementsSelectable,
    panActivationKeyPressed,
  } = useReactFlow(selector, shallow);
  const nodes = useNodeInternals(getNodes, _.isEqual);
  const resizeObserverRef = useRef<ResizeObserver>();
  const activeSectionIds = useActiveSection((x) => x.ids);

  const resizeObserver = useMemo(() => {
    if (typeof ResizeObserver === "undefined") {
      return null;
    }

    const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const updates = entries.map((entry: ResizeObserverEntry) => ({
        id: entry.target.getAttribute("data-id") as string,
        nodeElement: entry.target as HTMLDivElement,
        forceUpdate: true,
      }));

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
      {nodes.map((node) => {
        const isDraggable = !!(
          !panActivationKeyPressed &&
          (node.draggable ||
            (nodesDraggable && typeof node.draggable === "undefined"))
        );
        const isSelectable = !!(
          !panActivationKeyPressed &&
          (node.selectable ||
            (elementsSelectable && typeof node.selectable === "undefined"))
        );
        const isFocusable = !!(
          node.focusable ||
          (nodesFocusable && typeof node.focusable === "undefined")
        );

        const posX = node.position?.x ?? 0;
        const posY = node.position?.y ?? 0;

        return (
          <NodeWrapper
            key={node.id}
            id={node.id}
            style={node.style}
            xPos={posX}
            yPos={posY}
            selected={activeSectionIds.includes(node.id)}
            isDraggable={isDraggable}
            isSelectable={isSelectable}
            isFocusable={isFocusable}
            resizeObserver={resizeObserver}
            initialized={!!node.width && !!node.height}
            zIndex={node.tempZIndex}
          />
        );
      })}
    </div>
  );
};

NodeRenderer.displayName = "NodeRenderer";

export default memo(NodeRenderer);
