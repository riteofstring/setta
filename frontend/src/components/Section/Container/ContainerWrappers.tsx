import { useDndState } from "forks/dnd-kit/dndState";
import _ from "lodash";
import React from "react";
import { getAncestorSameVisibility } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { Container } from "./ContainerCore";

function _DndSlotAndDndWatcher({
  isGroup,
  sectionId,
  droppableRef,
  draggableRef,
  dragListeners,
  visibility,
  isEditingViewMode,
  isUserView,
  children,
}) {
  return (
    <DndWatcherAndContainer
      isGroup={isGroup}
      sectionId={sectionId}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      dragListeners={dragListeners}
      visibility={visibility}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
    >
      {children}
    </DndWatcherAndContainer>
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
  droppableRef,
  draggableRef,
  dragListeners,
  visibility,
  isEditingViewMode,
  isUserView,
  children,
}) {
  const activeIsSelf = useDndState((x) => x.activeId === sectionId);
  const isDragging = useDndState((x) => x.activeId !== null);
  const ancestorHasSameVisibility = useProjectState((x) =>
    getAncestorSameVisibility(sectionId, x),
  );
  const trueDragListeners = dragListeners ?? {};

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = isDragging ? "nodrag" : "";
  const fullStyle = {
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
