import React from "react";
import { ViewingEditingModeEnum } from "utils/generatedTypes";
import { Container } from "./ContainerCore";

function _DndSlotAndDndWatcher({
  isGroup,
  sectionId,
  isTopLevel,
  droppableRef,
  draggableRef,
  dragListeners,
  visibility,
  viewingEditingMode,
  children,
}) {
  // const { style, behaviorDropType } = useHighlightDroppable({
  //   sectionId,
  //   isGroup,
  // });

  return (
    // <DndSlot behaviorDropType={behaviorDropType} isGroup={isGroup}>
    <DndWatcherAndContainer
      isGroup={isGroup}
      sectionId={sectionId}
      isTopLevel={isTopLevel}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      dragListeners={dragListeners}
      visibility={visibility}
      viewingEditingMode={viewingEditingMode}
      // style={style}
    >
      {children}
    </DndWatcherAndContainer>
    // </DndSlot>
  );
}

export const DndSlotAndDndWatcher = React.memo(
  _DndSlotAndDndWatcher,
  () => true,
);

function _DndWatcherAndContainer({
  isGroup,
  sectionId,
  isTopLevel,
  droppableRef,
  draggableRef,
  dragListeners,
  visibility,
  viewingEditingMode,
  style,
  children,
}) {
  // const activeIsSelf = useDndState((x) => x.activeId === sectionId);
  // const { isSorting, isMovingFree } = useDndMode();
  // const ancestorHasSameVisibility = useProjectState((x) =>
  //   getAncestorSameVisibility(sectionId, x),
  // );
  // const trueDragListeners =
  //   isMovingFree || (!isTopLevel && isSorting) ? dragListeners : {};

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  // const className = isSorting || isMovingFree ? "nodrag" : "";
  // const fullStyle = {
  //   ...style,
  //   ...maybeGetOpacityStyle(
  //     activeIsSelf,
  //     visibility,
  //     viewingEditingMode,
  //     ancestorHasSameVisibility,
  //   ),
  // };

  return (
    <Container
      isGroup={isGroup}
      sectionId={sectionId}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      // trueDragListeners={trueDragListeners}
      viewingEditingMode={viewingEditingMode}
      // className={className}
      // style={fullStyle}
    >
      {children}
    </Container>
  );
}

function maybeGetOpacityStyle(
  activeIsSelf,
  visibility,
  viewingEditingMode,
  ancestorHasSameVisibility,
) {
  if (!visibility && viewingEditingMode === ViewingEditingModeEnum.USER_EDIT) {
    return ancestorHasSameVisibility ? {} : { opacity: 0.3 };
  }
  if (activeIsSelf) {
    return { opacity: 0.5 };
  }
  return {};
}

const DndWatcherAndContainer = React.memo(_DndWatcherAndContainer, () => true);
