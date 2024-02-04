import cc from "classcat";
import type { ComponentType, KeyboardEvent, MouseEvent } from "react";
import { memo, useEffect, useRef } from "react";

import { useSectionInfos } from "models/info/sectionInfos";
import useDrag from "../../hooks/useDrag";
import { useStoreApi } from "../../hooks/useStore";
import useUpdateNodePositions from "../../hooks/useUpdateNodePositions";
import type { NodeProps, WrapNodeProps, XYPosition } from "../../types";
import { isInputDOMNode } from "../../utils";
import { getMouseHandler } from "./utils";

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
    data,
    xPos,
    yPos,
    selected,
    onClick,
    onContextMenu,
    style,
    className,
    isDraggable,
    isSelectable,
    isFocusable,
    selectNodesOnDrag,
    sourcePosition,
    targetPosition,
    hidden,
    resizeObserver,
    noDragClassName,
    noPanClassName,
    initialized,
    ariaLabel,
  }: WrapNodeProps) => {
    const store = useStoreApi();
    const nodeRef = useRef<HTMLDivElement>(null);
    const prevSourcePosition = useRef(sourcePosition);
    const prevTargetPosition = useRef(targetPosition);
    const prevType = useRef(type);
    const hasPointerEvents = isSelectable || isDraggable || onClick;
    const updatePositions = useUpdateNodePositions();
    const zIndex = useSectionInfos((x) => x.x[id]?.zIndex);

    const onContextMenuHandler = getMouseHandler(
      id,
      store.getState,
      onContextMenu,
    );
    const onSelectNodeHandler = (event: MouseEvent) => {
      if (onClick) {
        const node = store.getState().nodeInternals.get(id);

        if (node) {
          onClick(event, { ...node });
        }
      }
    };

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
      if (nodeRef.current && !hidden) {
        const currNode = nodeRef.current;
        resizeObserver?.observe(currNode);

        return () => resizeObserver?.unobserve(currNode);
      }
    }, [hidden]);

    useEffect(() => {
      // when the user programmatically changes the source or handle position, we re-initialize the node
      const typeChanged = prevType.current !== type;
      const sourcePosChanged = prevSourcePosition.current !== sourcePosition;
      const targetPosChanged = prevTargetPosition.current !== targetPosition;

      if (
        nodeRef.current &&
        (typeChanged || sourcePosChanged || targetPosChanged)
      ) {
        if (typeChanged) {
          prevType.current = type;
        }
        if (sourcePosChanged) {
          prevSourcePosition.current = sourcePosition;
        }
        if (targetPosChanged) {
          prevTargetPosition.current = targetPosition;
        }
        store
          .getState()
          .updateNodeDimensions([
            { id, nodeElement: nodeRef.current, forceUpdate: true },
          ]);
      }
    }, [id, type, sourcePosition, targetPosition]);

    const dragging = useDrag({
      nodeRef,
      disabled: hidden || !isDraggable,
      noDragClassName,
      nodeId: id,
      isSelectable,
      selectNodesOnDrag,
    });

    if (hidden) {
      return null;
    }

    return (
      <div
        className={cc([
          "react-flow__node",
          `react-flow__node-${type}`,
          {
            // this is overwritable by passing `nopan` as a class name
            [noPanClassName]: isDraggable,
          },
          className,
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
        onContextMenu={onContextMenuHandler}
        onClick={onSelectNodeHandler}
        onKeyDown={isFocusable ? onKeyDown : undefined}
        tabIndex={isFocusable ? 0 : undefined}
        role={isFocusable ? "button" : undefined}
        aria-label={ariaLabel}
      >
        <NodeComponent
          id={id}
          data={data}
          type={type}
          xPos={xPos}
          yPos={yPos}
          selected={selected}
          sourcePosition={sourcePosition}
          targetPosition={targetPosition}
          dragging={dragging}
        />
      </div>
    );
  };

  NodeWrapper.displayName = "NodeWrapper";

  return memo(NodeWrapper);
};
