import _ from "lodash";
import React from "react";
import { useDndState } from "utils/DNDSortable/dndState";
import {
  useDndMode,
  useHighlightDroppable,
} from "utils/DNDSortable/useDndUtils";
import { Container } from "./ContainerCore";
import { DndSlot } from "./DndSlot";

function _DndSlotAndDndWatcher({
  isDeck,
  sectionId,
  isTopLevel,
  droppableRef,
  draggableRef,
  dragListeners,
  children,
}) {
  const { style, positionDropType, behaviorDropType } =
    useHighlightDroppable(sectionId);
  return (
    <DndSlot
      positionDropType={positionDropType}
      behaviorDropType={behaviorDropType}
      isDeck={isDeck}
    >
      <DndWatcherAndContainer
        isDeck={isDeck}
        sectionId={sectionId}
        isTopLevel={isTopLevel}
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
  (p, n) => p.isDeck === n.isDeck && p.children === n.children,
);

function _DndWatcherAndContainer({
  isDeck,
  sectionId,
  isTopLevel,
  droppableRef,
  draggableRef,
  dragListeners,
  style,
  children,
}) {
  const activeIsSelf = useDndState((x) => x.activeId === sectionId);
  const { isSorting, isMovingFree } = useDndMode();
  const isDraggingSortable = !isTopLevel && (isSorting || isMovingFree);
  const isDraggingTopLevel = isTopLevel && isMovingFree;
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
