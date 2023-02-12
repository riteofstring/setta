import { useHighlightDroppable } from "hooks/useDndUtils";
import _ from "lodash";
import { useDndState } from "models/info/dndState";
import { useKeyActivations } from "models/keyActivations";
import React from "react";
import { Container } from "./ContainerCore";
import { DndSlot } from "./DndSlot";

function _DndSlotAndDndWatcher({
  isDeck,
  sectionId,
  parentId,
  droppableRef,
  draggableRef,
  dragListeners,
  children,
}) {
  const { style, highlight, highlightSubType } =
    useHighlightDroppable(sectionId);
  return (
    <DndSlot highlight={highlight} highlightSubType={highlightSubType}>
      <DndWatcherAndContainer
        isDeck={isDeck}
        sectionId={sectionId}
        parentId={parentId}
        droppableRef={droppableRef}
        draggableRef={draggableRef}
        dragListeners={dragListeners}
        style={style}
      >
        {children}
      </DndWatcherAndContainer>
    </DndSlot>
  );
}

export const DndSlotAndDndWatcher = React.memo(
  _DndSlotAndDndWatcher,
  (p, n) =>
    p.isDeck === n.isDeck &&
    p.parentId === n.parentId &&
    p.children === n.children
);

function _DndWatcherAndContainer({
  isDeck,
  sectionId,
  parentId,
  droppableRef,
  draggableRef,
  dragListeners,
  style,
  children,
}) {
  const activeIsSelf = useDndState((x) => x.activeId === sectionId);
  const isSorting = useKeyActivations((x) => x.isSorting);
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const isDraggingSortable = parentId && (isSorting || isMovingFree);
  const isDraggingTopLevel = !parentId && isMovingFree;
  const trueDragListeners =
    isDraggingSortable || isDraggingTopLevel ? dragListeners : {};

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = isDraggingSortable ? "nodrag" : "";
  const fullStyle = activeIsSelf ? { ...style, opacity: 0.5 } : style;

  return (
    <Container
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      trueDragListeners={trueDragListeners}
      className={className}
      style={fullStyle}
    >
      {children}
    </Container>
  );
}

const DndWatcherAndContainer = React.memo(_DndWatcherAndContainer, _.isEqual);
