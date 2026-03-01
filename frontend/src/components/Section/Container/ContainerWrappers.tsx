import { useDndMode, useDndState } from "forks/dnd-kit/dndState";
import { useHighlightDroppable } from "forks/dnd-kit/useDndUtils";
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
    p.sectionId === n.sectionId &&
    p.isTopLevel === n.isTopLevel &&
    p.droppableRef === n.droppableRef &&
    p.draggableRef === n.draggableRef &&
    p.children === n.children &&
    p.visibility === n.visibility &&
    p.isEditingViewMode === n.isEditingViewMode &&
    p.isUserView === n.isUserView &&
    areShallowObjectValuesEqual(p.dragListeners, n.dragListeners),
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
  const isDraggingSelection = useDndState(
    (state) => state.activeId !== null && state.draggingIds.includes(sectionId),
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

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = isSorting || isMovingFree ? "nodrag" : "";
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

const DndWatcherAndContainer = React.memo(
  _DndWatcherAndContainer,
  (p, n) =>
    p.isGroup === n.isGroup &&
    p.sectionId === n.sectionId &&
    p.isTopLevel === n.isTopLevel &&
    p.droppableRef === n.droppableRef &&
    p.draggableRef === n.draggableRef &&
    p.visibility === n.visibility &&
    p.isEditingViewMode === n.isEditingViewMode &&
    p.isUserView === n.isUserView &&
    p.children === n.children &&
    areShallowObjectValuesEqual(p.dragListeners, n.dragListeners) &&
    areShallowObjectValuesEqual(p.style, n.style),
);

function areShallowObjectValuesEqual(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}
