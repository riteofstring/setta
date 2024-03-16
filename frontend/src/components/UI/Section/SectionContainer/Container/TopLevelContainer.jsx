import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useDndState } from "utils/DNDSortable/dndState";
import { useDndProps } from "utils/DNDSortable/useDndUtils";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";

export function TopLevelContainer({ isDeck, sectionId, children }) {
  const activeIsSelf = useDndState((x) => x.activeId === sectionId);
  const dndProps = useDndProps({ sectionId, isTopLevel: true });
  const { setNodeRef: droppableRef } = useDroppable({
    ...dndProps,
    disabled: activeIsSelf,
  });
  const { listeners: dragListeners, setNodeRef: draggableRef } =
    useDraggable(dndProps);

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
