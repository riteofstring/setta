import { useDraggable, useDroppable } from "forks/dnd-kit/adapter";
import { useDndState } from "forks/dnd-kit/dndState";
import { useDndProps } from "forks/dnd-kit/useDndUtils";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";

export function TopLevelContainer({
  isGroup,
  sectionId,
  visibility,
  isEditingViewMode,
  isUserView,
  children,
}: {
  isGroup: boolean;
  sectionId: string;
  children: React.ReactNode;
  visibility: boolean;
  isEditingViewMode: boolean;
  isUserView: boolean;
}) {
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
      isGroup={isGroup}
      sectionId={sectionId}
      isTopLevel={true}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      dragListeners={dragListeners}
      visibility={visibility}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
