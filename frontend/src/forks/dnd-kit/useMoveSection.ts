import { useDndState } from "forks/dnd-kit/dndState";
import { getSectionChildren } from "state/actions/sectionInfos";
import { moveSectionWithBackend } from "state/actions/sections/moveSections";
import { useProjectState } from "state/definitions";
import type { DragEndEvent } from "./adapter";

function onSortEnd({ active, over }: Pick<DragEndEvent, "active" | "over">) {
  if (!over || active.id === over.id) {
    if (active?.id) {
      console.log("[dnd] dragend-no-op", { activeId: String(active.id) });
    }
    return;
  }

  const activeId = String(active.id);
  const overId = String(over.id);
  if (activeId === overId) {
    console.log("[dnd] dragend-no-op", { activeId });
    return;
  }

  const state = useProjectState.getState();
  const parentId = state.parentSectionMap[activeId];
  const overParentId = state.parentSectionMap[overId];

  if (!parentId || parentId !== overParentId) {
    console.log("[dnd] dragend-parent-mismatch", {
      activeId,
      overId,
      parentId,
      overParentId,
    });
    return;
  }

  const children = getSectionChildren(state, parentId);
  const overIndex = children.indexOf(overId);
  if (overIndex < 0) {
    console.log("[dnd] dragend-over-missing", {
      activeId,
      overId,
      parentId,
    });
    return;
  }

  console.log("[dnd] dragend-reorder", {
    activeId,
    overId,
    parentId,
    overIndex,
  });
  moveSectionWithBackend({
    oldParentId: parentId,
    newParentId: parentId,
    sectionId: activeId,
    newIndex: overIndex,
    position: null,
  });
}

export function useOnDragEnd() {
  function onDragEnd({ active, over, canceled }: DragEndEvent) {
    if (!canceled) {
      onSortEnd({ active, over });
    }

    useDndState.setState({ activeId: null, overId: null });
  }

  return { onDragEnd };
}
