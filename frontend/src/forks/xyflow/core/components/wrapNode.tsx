import cc from "classcat";
import { SectionContainerNode } from "components/Section/Container/SectionContainerNode";
import _ from "lodash";
import type { KeyboardEvent } from "react";
import { memo, useEffect, useRef } from "react";
import { setNodeDimensions } from "state/actions/nodeInternals";
import { useSectionInfos } from "state/definitions";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import useDrag from "../hooks/useDrag";
import useUpdateNodePositions from "../hooks/useUpdateNodePositions";
import type { WrapNodeProps, XYPosition } from "../types";
import { getDimensions, isInputDOMNode } from "../utils";

export const arrowKeyDiffs: Record<string, XYPosition> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const _NodeWrapper = ({
  id,
  xPos,
  yPos,
  selected,
  style,
  isDraggable,
  isSelectable,
  isFocusable,
  initialized,
  zIndex,
}: WrapNodeProps) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const hasPointerEvents = isSelectable || isDraggable;
  const updatePositions = useUpdateNodePositions();
  const size = useSectionInfos((x) => x.x[id].size, _.isEqual);

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
      const dimensions = getDimensions(nodeRef.current);
      setNodeDimensions(id, dimensions);
    }
  }, [size.width, size.height]);

  useDrag({
    nodeRef,
    disabled: !isDraggable,
    nodeId: id,
    isSelectable,
  });

  return (
    <div
      className={cc([
        "react-flow__node",
        {
          // this is overwritable by passing `nopan` as a class name
          [NO_PAN_CLASS_NAME]: isDraggable,
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
      <SectionContainerNode id={id} />
    </div>
  );
};

export const NodeWrapper = memo(_NodeWrapper);
