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
  const activeIsSelf = useDndState((x) => x.activeId === sectionId);
  const { isSorting, isMovingFree } = useDndMode();
  const ancestorHasSameVisibility = useProjectState((x) =>
    getAncestorSameVisibility(sectionId, x),
  );
  const trueDragListeners =
    isMovingFree || (!isTopLevel && isSorting) ? dragListeners : {};

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = isSorting || isMovingFree ? "nodrag" : "";
  const fullStyle = {
    ...style,
    ...maybeGetOpacityStyle(
      activeIsSelf,
      visibility,
      isEditingViewMode,
      ancestorHasSameVisibility,
    ),
  };

  return (
    <Container
      isGroup={isGroup}
      sectionId={sectionId}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      trueDragListeners={trueDragListeners}
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
  activeIsSelf,
  visibility,
  isEditingViewMode,
  ancestorHasSameVisibility,
) {
  if (!visibility && isEditingViewMode) {
    return ancestorHasSameVisibility ? {} : { opacity: 0.3 };
  }
  if (activeIsSelf) {
    return { opacity: 0.5 };
  }
  return {};
}

const DndWatcherAndContainer = React.memo(_DndWatcherAndContainer, _.isEqual);
