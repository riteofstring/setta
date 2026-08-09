import _ from "lodash";
import React, { type CSSProperties, type ReactNode } from "react";
import { useDndMode, useDndState } from "../../dnd/dndState";
import { useHighlightDroppable } from "../../dnd/useDndUtils";
import { Container, type SectionDragListeners, type SectionDragRef } from "./ContainerCore";
import { DndSlot } from "./DndSlot";

// The reference's `ContainerWrappers.tsx` minus the view-mode visibility styling, which left
// with the app's view modes.

type DndWatcherProps = {
  isGroup: boolean;
  sectionId: string;
  isTopLevel: boolean;
  droppableRef?: SectionDragRef;
  draggableRef?: SectionDragRef;
  dragListeners?: SectionDragListeners;
  children: ReactNode;
};

function DndSlotAndDndWatcherComponent({
  isGroup,
  sectionId,
  isTopLevel,
  droppableRef,
  draggableRef,
  dragListeners,
  children,
}: DndWatcherProps) {
  const { style, behaviorDropType } = useHighlightDroppable({
    sectionId,
    isGroup,
  });

  return (
    <DndSlot behaviorDropType={behaviorDropType} isGroup={isGroup}>
      <DndWatcherAndContainer
        isGroup={isGroup}
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
  DndSlotAndDndWatcherComponent,
  (p, n) =>
    p.isGroup === n.isGroup &&
    p.children === n.children &&
    _.isEqual(p.dragListeners, n.dragListeners),
);

function DndWatcherAndContainerComponent({
  isGroup,
  sectionId,
  isTopLevel,
  droppableRef,
  draggableRef,
  dragListeners,
  style,
  children,
}: DndWatcherProps & { style: CSSProperties }) {
  const { isDraggingSelection } = useDndState(
    (state) => ({
      isDraggingSelection: state.activeId !== null && state.draggingIds.includes(sectionId),
    }),
    _.isEqual,
  );
  const { isSorting, isMovingFree } = useDndMode();
  const wrappedDragListeners = React.useMemo(() => {
    const trueDragListeners =
      isMovingFree || (!isTopLevel && isSorting) ? (dragListeners ?? {}) : {};
    if (isTopLevel) {
      return trueDragListeners;
    }
    const { onPointerDown, onMouseDown, onTouchStart, ...rest } = trueDragListeners;
    const wrap =
      <E extends React.SyntheticEvent<HTMLDivElement>>(handler: (event: E) => void) =>
      (event: E) => {
        event.stopPropagation();
        handler(event);
      };
    return {
      ...rest,
      ...(onPointerDown ? { onPointerDown: wrap(onPointerDown) } : {}),
      ...(onMouseDown ? { onMouseDown: wrap(onMouseDown) } : {}),
      ...(onTouchStart ? { onTouchStart: wrap(onTouchStart) } : {}),
    };
  }, [dragListeners, isMovingFree, isSorting, isTopLevel]);

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = isSorting || isMovingFree ? "nodrag" : "";
  const fullStyle = {
    ...style,
    ...maybeGetOpacityStyle(isDraggingSelection, isSorting),
  };

  return (
    <Container
      isGroup={isGroup}
      sectionId={sectionId}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      trueDragListeners={wrappedDragListeners}
      className={className}
      style={fullStyle}
    >
      {children}
    </Container>
  );
}

function maybeGetOpacityStyle(isDraggingSelection: boolean, isSorting: boolean): CSSProperties {
  if (isDraggingSelection) {
    return { opacity: isSorting ? 0.85 : 0.5 };
  }
  return {};
}

const DndWatcherAndContainer = React.memo(DndWatcherAndContainerComponent, _.isEqual);
