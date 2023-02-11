import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";

export function TopLevelContainer({ isDeck, sectionId, parentId, children }) {
  const dndProps = {
    id: sectionId,
    data: { isTopLevel: true },
  };
  const { setNodeRef: droppableRef } = useDroppable(dndProps);
  const { listeners: dragListeners, setNodeRef: draggableRef } =
    useDraggable(dndProps);

  return (
    <DndSlotAndDndWatcher
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      dragListeners={dragListeners}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
