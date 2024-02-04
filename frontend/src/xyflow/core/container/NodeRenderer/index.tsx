import type { ComponentType } from "react";
import { memo, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { devWarn } from "xyflow/core/utils";
import { errorMessages } from "../../contants";
import { useStore } from "../../hooks/useStore";
import useVisibleNodes from "../../hooks/useVisibleNodes";
import { containerStyle } from "../../styles";
import type {
  NodeTypesWrapped,
  ReactFlowState,
  WrapNodeProps,
} from "../../types";
import { GraphViewProps } from "../GraphView";

type NodeRendererProps = Pick<
  GraphViewProps,
  "selectNodesOnDrag" | "noPanClassName" | "noDragClassName"
> & {
  nodeTypes: NodeTypesWrapped;
};

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
        let nodeType = node.type || "default";

        if (!props.nodeTypes[nodeType]) {
          devWarn("003", errorMessages["error003"](nodeType));

          nodeType = "default";
        }

        const NodeComponent = (props.nodeTypes[nodeType] ||
          props.nodeTypes.default) as ComponentType<WrapNodeProps>;
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

        const clampedPosition = node.position;

        const posX = clampedPosition?.x ?? 0;
        const posY = clampedPosition?.y ?? 0;

        return (
          <NodeComponent
            key={node.id}
            id={node.id}
            className={node.className}
            style={node.style}
            type={nodeType}
            hidden={node.hidden}
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
            ariaLabel={node.ariaLabel}
          />
        );
      })}
    </div>
  );
};

NodeRenderer.displayName = "NodeRenderer";

export default memo(NodeRenderer);
