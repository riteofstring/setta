import cc from "classcat";
import { SectionContainer } from "components/Section/Container/SectionContainer";
import type { KeyboardEvent } from "react";
import { memo, useEffect, useRef } from "react";
import { useSectionInfos } from "state/definitions";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import useDrag from "../hooks/useDrag";
import { updatePositions } from "../hooks/useUpdateNodePositions";
import type { WrapNodeProps, XYPosition } from "../types";
import { isInputDOMNode } from "../utils";

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
  isDraggable: _isDraggable,
  isSelectable,
  isFocusable,
  resizeObserver,
  initialized,
  zIndex,
}: WrapNodeProps) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const prevNodeRef = useRef<HTMLDivElement>(null);
  const positionAndSizeLocked = useSectionInfos(
    (x) => x.x[id].positionAndSizeLocked,
  );
  const isDraggable = _isDraggable && !positionAndSizeLocked;
  const hasPointerEvents = isSelectable || isDraggable;

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
    return () => {
      if (prevNodeRef.current) {
        resizeObserver?.unobserve(prevNodeRef.current);
        prevNodeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (nodeRef.current) {
      const currNode = nodeRef.current;
      if (!initialized || prevNodeRef.current !== currNode) {
        // At this point we always want to make sure that the node gets re-measured / re-initialized.
        // We need to unobserve it first in case it is still observed
        if (prevNodeRef.current) {
          resizeObserver?.unobserve(prevNodeRef.current);
        }
        resizeObserver?.observe(currNode);
        prevNodeRef.current = currNode;
      }
    }
  }, [initialized]);

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
      <SectionContainer sectionId={id} />
    </div>
  );
};

export const NodeWrapper = memo(_NodeWrapper);
