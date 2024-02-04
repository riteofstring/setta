import { memo, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { NodeWrapper } from "xyflow/core/components/Nodes/wrapNode";
import { useStore } from "../../hooks/useStore";
import useVisibleNodes from "../../hooks/useVisibleNodes";
import { containerStyle } from "../../styles";
import type { ReactFlowState } from "../../types";
import { GraphViewProps } from "../GraphView";

type NodeRendererProps = Pick<
  GraphViewProps,
  "selectNodesOnDrag" | "noPanClassName" | "noDragClassName"
>;

const selector = (s: ReactFlowState) => ({
  nodesDraggable: s.nodesDraggable,
  nodesFocusable: s.nodesFocusable,
  elementsSelectable: s.elementsSelectable,
  updateNodeDimensions: s.updateNodeDimensions,
});

const NodeRenderer = (props: NodeRendererProps) => {
  const {
    nodesDraggable,
    nodesFocusable,
    elementsSelectable,
    updateNodeDimensions,
  } = useStore(selector, shallow);
  const nodes = useVisibleNodes();
  const resizeObserverRef = useRef<ResizeObserver>();

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
          node.draggable ||
          (nodesDraggable && typeof node.draggable === "undefined")
        );
        const isSelectable = !!(
          node.selectable ||
          (elementsSelectable && typeof node.selectable === "undefined")
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
            selectNodesOnDrag={props.selectNodesOnDrag}
            selected={!!node.selected}
            isDraggable={isDraggable}
            isSelectable={isSelectable}
            isFocusable={isFocusable}
            resizeObserver={resizeObserver}
            noDragClassName={props.noDragClassName}
            noPanClassName={props.noPanClassName}
            initialized={!!node.width && !!node.height}
            zIndex={node.zIndex}
          />
        );
      })}
    </div>
  );
};

NodeRenderer.displayName = "NodeRenderer";

export default memo(NodeRenderer);
