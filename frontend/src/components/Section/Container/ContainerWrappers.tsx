import { useDndMode, useDndState } from "forks/dnd-kit/dndState";
import { useHighlightDroppable } from "forks/dnd-kit/useDndUtils";
import _ from "lodash";
import React from "react";
import { getAncestorSameVisibility } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { Container } from "./ContainerCore";
import { DndSlot } from "./DndSlot";

function _DndSlotAndDndWatcher({
  isGroup,
  sectionId,
  isTopLevel,
  droppableRef,
  draggableRef,
  dragListeners,
  visibility,
  isEditingViewMode,
  isUserView,
  children,
}) {
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
        visibility={visibility}
        isEditingViewMode={isEditingViewMode}
        isUserView={isUserView}
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
    p.isGroup === n.isGroup &&
    p.children === n.children &&
    p.visibility === n.visibility &&
    p.isEditingViewMode === n.isEditingViewMode &&
    p.isUserView === n.isUserView &&
    _.isEqual(p.dragListeners, n.dragListeners),
);

function _DndWatcherAndContainer({
  isGroup,
  sectionId,
  isTopLevel,
  droppableRef,
  draggableRef,
  dragListeners,
  visibility,
  isEditingViewMode,
  isUserView,
  style,
  children,
}) {
  const { isDraggingSelection } = useDndState(
    (state) => ({
      isDraggingSelection:
        state.activeId !== null && state.draggingIds.includes(sectionId),
    }),
    _.isEqual,
  );
  const { isSorting, isMovingFree } = useDndMode();
  const ancestorHasSameVisibility = useProjectState((x) =>
    getAncestorSameVisibility(sectionId, x),
  );
  const trueDragListeners =
    isMovingFree || (!isTopLevel && isSorting) ? dragListeners : {};
  const wrappedDragListeners = React.useMemo(() => {
    if (isTopLevel || !trueDragListeners) {
      return trueDragListeners;
    }
    const { onPointerDown, onMouseDown, onTouchStart, ...rest } =
      trueDragListeners;
    const wrap = (handler) => (event) => {
      event.stopPropagation();
      if (handler) {
        handler(event);
      }
    };
    return {
      ...rest,
      ...(onPointerDown ? { onPointerDown: wrap(onPointerDown) } : {}),
      ...(onMouseDown ? { onMouseDown: wrap(onMouseDown) } : {}),
      ...(onTouchStart ? { onTouchStart: wrap(onTouchStart) } : {}),
    };
  }, [isTopLevel, trueDragListeners]);

  // Don't want the GPU flow node (which contains this child)
  // to move when sorting
  const className = [
    isTopLevel ? "h-full w-full" : "",
    isSorting || isMovingFree ? "nodrag" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const fullStyle = {
    ...style,
    ...maybeGetOpacityStyle(
      isDraggingSelection,
      visibility,
      isEditingViewMode,
      ancestorHasSameVisibility,
      isSorting,
    ),
  };

  return (
    <Container
      isGroup={isGroup}
      sectionId={sectionId}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      trueDragListeners={wrappedDragListeners}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
      className={className}
      style={fullStyle}
    >
      {children}
    </Container>
  );
}

function maybeGetOpacityStyle(
  isDraggingSelection,
  visibility,
  isEditingViewMode,
  ancestorHasSameVisibility,
  isSorting,
) {
  if (!visibility && isEditingViewMode) {
    return ancestorHasSameVisibility ? {} : { opacity: 0.3 };
  }
  if (isDraggingSelection) {
    return { opacity: isSorting ? 0.85 : 0.5 };
  }
  return {};
}

const DndWatcherAndContainer = React.memo(_DndWatcherAndContainer, _.isEqual);
