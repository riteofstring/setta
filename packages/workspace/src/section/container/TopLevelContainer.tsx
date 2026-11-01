import type { ReactNode } from "react";
import { useDraggable, useDroppable } from "../../dnd/adapter/index.js";
import { useDndMode, useDndState } from "../../dnd/dndState.js";
import { useDndProps } from "../../dnd/useDndUtils.js";
import { DndSlotAndDndWatcher } from "./ContainerWrappers.js";

export function TopLevelContainer({
  dimmed,
  isGroup,
  sectionId,
  children,
}: {
  dimmed: boolean;
  isGroup: boolean;
  sectionId: string;
  children: ReactNode;
}) {
  const activeIsSelf = useDndState((x) => x.activeId === sectionId);
  const { isMovingFree } = useDndMode();
  const dndProps = useDndProps({ sectionId, isTopLevel: true });
  const { setNodeRef: droppableRef } = useDroppable({
    ...dndProps,
    disabled: activeIsSelf,
  });
  const { listeners: dragListeners, setNodeRef: draggableRef } = useDraggable({
    ...dndProps,
    feedback: isMovingFree ? "none" : undefined,
  });

  return (
    <DndSlotAndDndWatcher
      dimmed={dimmed}
      isGroup={isGroup}
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
