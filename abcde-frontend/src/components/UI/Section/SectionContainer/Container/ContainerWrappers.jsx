import { useHighlightDroppable } from "hooks/useDndUtils";
import _ from "lodash";
import { useDndState } from "models/info/dndState";
import { useKeyActivations } from "models/keyActivations";
import React from "react";
import { Container } from "./ContainerCore";
import { DndSlot } from "./DndSlot";

function _DndSlotAndDndWatcher({ sectionId, children, ...props }) {
  const { className, style, highlight } = useHighlightDroppable(sectionId);
  return (
    <DndSlot highlight={highlight}>
      <DndWatcherAndContainer
        sectionId={sectionId}
        {...props}
        className={className}
        style={style}
      >
        {children}
      </DndWatcherAndContainer>
    </DndSlot>
  );
}

export const DndSlotAndDndWatcher = React.memo(
  _DndSlotAndDndWatcher,
  _.isEqual
);

function _DndWatcherAndContainer({
  sectionId,
  parentId,
  dragListeners,
  className,
  children,
  ...props
}) {
  const active = useDndState((x) => x.active);
  const isSorting = useKeyActivations((x) => x.isSorting);
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const isDraggingSortable = parentId && (isSorting || isMovingFree);
  const isDraggingTopLevel = !parentId && isMovingFree;
  const trueDragListeners =
    isDraggingSortable || isDraggingTopLevel ? dragListeners : {};

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const fullClassName = `${isDraggingSortable ? "nodrag" : ""} ${
    active?.id === sectionId ? "opacity-50" : ""
  } ${className}`;

  return (
    <Container
      sectionId={sectionId}
      parentId={parentId}
      trueDragListeners={trueDragListeners}
      className={fullClassName}
      {...props}
    >
      {children}
    </Container>
  );
}

const DndWatcherAndContainer = React.memo(_DndWatcherAndContainer, _.isEqual);
