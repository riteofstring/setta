import cc from "classcat";
import type { ComponentType, KeyboardEvent } from "react";
import { memo, useEffect, useRef } from "react";

import { useSectionInfos } from "models/info/sectionInfos";
import useDrag from "../../hooks/useDrag";
import { useStoreApi } from "../../hooks/useStore";
import useUpdateNodePositions from "../../hooks/useUpdateNodePositions";
import type { NodeProps, WrapNodeProps, XYPosition } from "../../types";
import { isInputDOMNode } from "../../utils";

export const arrowKeyDiffs: Record<string, XYPosition> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

export default (NodeComponent: ComponentType<NodeProps>) => {
  const NodeWrapper = ({
    id,
    type,
    xPos,
    yPos,
    selected,
    style,
    isDraggable,
    isSelectable,
    isFocusable,
    selectNodesOnDrag,
    resizeObserver,
    noDragClassName,
    noPanClassName,
    initialized,
  }: WrapNodeProps) => {
    const store = useStoreApi();
    const nodeRef = useRef<HTMLDivElement>(null);
    const prevType = useRef(type);
    const hasPointerEvents = isSelectable || isDraggable;
    const updatePositions = useUpdateNodePositions();
    const zIndex = useSectionInfos((x) => x.x[id]?.zIndex);

    const onKeyDown = (event: KeyboardEvent) => {
      if (isInputDOMNode(event)) {
        return;
      }

      if (
        isDraggable &&
        selected &&
        Object.prototype.hasOwnProperty.call(arrowKeyDiffs, event.key)
      ) {
        updatePositions({
          x: arrowKeyDiffs[event.key].x,
          y: arrowKeyDiffs[event.key].y,
          isShiftPressed: event.shiftKey,
        });
      }
    };

    useEffect(() => {
      if (nodeRef.current) {
        const currNode = nodeRef.current;
        resizeObserver?.observe(currNode);

        return () => resizeObserver?.unobserve(currNode);
      }
    }, []);

    useEffect(() => {
      // when the user programmatically changes the source or handle position, we re-initialize the node
      const typeChanged = prevType.current !== type;

      if (nodeRef.current && typeChanged) {
        if (typeChanged) {
          prevType.current = type;
        }
        store
          .getState()
          .updateNodeDimensions([
            { id, nodeElement: nodeRef.current, forceUpdate: true },
          ]);
      }
    }, [id, type]);

    const dragging = useDrag({
      nodeRef,
      disabled: !isDraggable,
      noDragClassName,
      nodeId: id,
      isSelectable,
      selectNodesOnDrag,
    });

    return (
      <div
        className={cc([
          "react-flow__node",
          `react-flow__node-${type}`,
          {
            // this is overwritable by passing `nopan` as a class name
            [noPanClassName]: isDraggable,
          },
          {
            selectable: isSelectable,
          },
        ])}
        ref={nodeRef}
        style={{
          transform: `translate(${xPos}px,${yPos}px)`,
          pointerEvents: hasPointerEvents ? "all" : "none",
          visibility: initialized ? "visible" : "hidden",
          zIndex,
          ...style,
        }}
        data-id={id}
        data-testid={`rf__node-${id}`}
        onKeyDown={isFocusable ? onKeyDown : undefined}
        tabIndex={isFocusable ? 0 : undefined}
        role={isFocusable ? "button" : undefined}
      >
        <NodeComponent
          id={id}
          type={type}
          xPos={xPos}
          yPos={yPos}
          selected={selected}
          dragging={dragging}
        />
      </div>
    );
  };

  NodeWrapper.displayName = "NodeWrapper";

  return memo(NodeWrapper);
};
