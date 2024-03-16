import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useDndState } from "utils/DNDSortable/dndState";
import { useDndProps } from "utils/DNDSortable/useDndUtils";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import React from "react"
import _ from "lodash";

export function TopLevelContainer(props) {
  const activeIsSelf = useDndState((x) => x.activeId === props.sectionId);
  const movingFreeInSortable = useDndState((x) => x.movingFreeInSortable);

  return activeIsSelf && movingFreeInSortable ? (
    <UnDraggableTopLevelContainer {...props}>
      {props.children}
    </UnDraggableTopLevelContainer>
  ) : (
    <DraggableTopLevelContainer {...props}>
      {props.children}
    </DraggableTopLevelContainer>
  );
}

function _DraggableTopLevelContainer({ isDeck, sectionId, children }) {
  const activeIsSelf = useDndState((x) => x.activeId === sectionId);
  const dndProps = useDndProps({ sectionId, isTopLevel: true });
  const { setNodeRef: droppableRef } = useDroppable({
    ...dndProps,
    disabled: activeIsSelf,
  });
  const { listeners: dragListeners, setNodeRef: draggableRef } = useDraggable({
    ...dndProps,
  });

  return (
    <DndSlotAndDndWatcher
      isDeck={isDeck}
      sectionId={sectionId}
      isTopLevel={true}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      dragListeners={dragListeners}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}

const DraggableTopLevelContainer = React.memo(_DraggableTopLevelContainer, _.isEqual)

function _UnDraggableTopLevelContainer({ isDeck, sectionId, children }) {
  return (
    <DndSlotAndDndWatcher
      isDeck={isDeck}
      sectionId={sectionId}
      isTopLevel={true}
      droppableRef={null}
      draggableRef={null}
      dragListeners={null}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}

const UnDraggableTopLevelContainer = React.memo(_UnDraggableTopLevelContainer, _.isEqual)