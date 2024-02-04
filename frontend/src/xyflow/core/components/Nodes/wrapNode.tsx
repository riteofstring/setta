import cc from "classcat";
import type { ComponentType, KeyboardEvent, MouseEvent } from "react";
import { memo, useEffect, useRef } from "react";

import { useSectionInfos } from "models/info/sectionInfos";
import { Provider } from "../../contexts/NodeIdContext";
import useDrag from "../../hooks/useDrag";
import { useStoreApi } from "../../hooks/useStore";
import useUpdateNodePositions from "../../hooks/useUpdateNodePositions";
import type { NodeProps, WrapNodeProps, XYPosition } from "../../types";
import { elementSelectionKeys, isInputDOMNode } from "../../utils";
import { getMouseHandler, handleNodeClick } from "./utils";

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
    xPosOrigin,
    yPosOrigin,
    selected,
    onClick,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    onContextMenu,
    onDoubleClick,
    style,
    className,
    isDraggable,
    isSelectable,
    isConnectable,
    isFocusable,
    selectNodesOnDrag,
    sourcePosition,
    targetPosition,
    hidden,
    resizeObserver,
    isParent,
    noDragClassName,
    noPanClassName,
    initialized,
    disableKeyboardA11y,
    ariaLabel,
    rfId,
  }: WrapNodeProps) => {
    const store = useStoreApi();
    const nodeRef = useRef<HTMLDivElement>(null);
    const prevSourcePosition = useRef(sourcePosition);
    const prevTargetPosition = useRef(targetPosition);
    const prevType = useRef(type);
    const hasPointerEvents =
      isSelectable ||
      isDraggable ||
      onClick ||
      onMouseEnter ||
      onMouseMove ||
      onMouseLeave;
    const updatePositions = useUpdateNodePositions();
    const zIndex = useSectionInfos((x) => x.x[id]?.zIndex);

    const onMouseEnterHandler = getMouseHandler(
      id,
      store.getState,
      onMouseEnter,
    );
    const onMouseMoveHandler = getMouseHandler(id, store.getState, onMouseMove);
    const onMouseLeaveHandler = getMouseHandler(
      id,
      store.getState,
      onMouseLeave,
    );
    const onContextMenuHandler = getMouseHandler(
      id,
      store.getState,
      onContextMenu,
    );
    const onDoubleClickHandler = getMouseHandler(
      id,
      store.getState,
      onDoubleClick,
    );
    const onSelectNodeHandler = (event: MouseEvent) => {
      const { nodeDragThreshold } = store.getState();

      if (
        isSelectable &&
        (!selectNodesOnDrag || !isDraggable || nodeDragThreshold > 0)
      ) {
        // this handler gets called within the drag start event when selectNodesOnDrag=true
        handleNodeClick({
          id,
          store,
          nodeRef,
        });
      }

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

      if (elementSelectionKeys.includes(event.key) && isSelectable) {
        const unselect = event.key === "Escape";

        handleNodeClick({
          id,
          store,
          unselect,
          nodeRef,
        });
      } else if (
        !disableKeyboardA11y &&
        isDraggable &&
        selected &&
        Object.prototype.hasOwnProperty.call(arrowKeyDiffs, event.key)
      ) {
        store.setState({
          ariaLiveMessage: `Moved selected node ${event.key
            .replace("Arrow", "")
            .toLowerCase()}. New position, x: ${~~xPos}, y: ${~~yPos}`,
        });

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
            parent: isParent,
          },
        ])}
        ref={nodeRef}
        style={{
          transform: `translate(${xPosOrigin}px,${yPosOrigin}px)`,
          pointerEvents: hasPointerEvents ? "all" : "none",
          visibility: initialized ? "visible" : "hidden",
          zIndex,
          ...style,
        }}
        data-id={id}
        data-testid={`rf__node-${id}`}
        onMouseEnter={onMouseEnterHandler}
        onMouseMove={onMouseMoveHandler}
        onMouseLeave={onMouseLeaveHandler}
        onContextMenu={onContextMenuHandler}
        onClick={onSelectNodeHandler}
        onDoubleClick={onDoubleClickHandler}
        onKeyDown={isFocusable ? onKeyDown : undefined}
        tabIndex={isFocusable ? 0 : undefined}
        role={isFocusable ? "button" : undefined}
        aria-label={ariaLabel}
      >
        <Provider value={id}>
          <NodeComponent
            id={id}
            data={data}
            type={type}
            xPos={xPos}
            yPos={yPos}
            selected={selected}
            isConnectable={isConnectable}
            sourcePosition={sourcePosition}
            targetPosition={targetPosition}
            dragging={dragging}
          />
        </Provider>
      </div>
    );
  };

  NodeWrapper.displayName = "NodeWrapper";

  return memo(NodeWrapper);
};
