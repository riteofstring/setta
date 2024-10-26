import { NodeWrapper } from "forks/xyflow/core/components/wrapNode";
import { useReactFlow } from "forks/xyflow/core/store";
import { memo } from "react";
import { shallow } from "zustand/shallow";
import useVisibleNodes from "../hooks/useVisibleNodes";
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
  const nodes = useVisibleNodes();

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
            selected={!!node.selected}
            isDraggable={isDraggable}
            isSelectable={isSelectable}
            isFocusable={isFocusable}
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
