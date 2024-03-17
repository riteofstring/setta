import colors from "tailwindcss/colors";
import { getSectionParentId } from "thunks/sections/getters";
import { useDndMonitor } from "utils/DNDSortable/CustomCore";
import { useDndMode, useDndState } from "utils/DNDSortable/dndState";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { useTempHasNested } from "../../hooks/useSectionChildren";

export function useHighlightDroppable(sectionId: string) {
  const overIsSelf = useOverIsSelf(sectionId);
  const behaviorDropType = useDndState((x) =>
    overIsSelf ? x.behaviorDropType : null,
  );
  const invalid = behaviorDropType === BehaviorDropType.INVALID;

  const style = invalid
    ? {
        borderRadius: "1.5rem",
        padding: "0.75rem",
        margin: "-0.75rem",
        transition: "background-color 0.2s",
        backgroundColor: invalid ? colors.red[600] : colors.blue[500],
      }
    : {};

  return {
    style,
    behaviorDropType,
  };
}

export function useDisableSortable(sectionId: string) {
  const { isSorting, isMovingFree } = useDndMode();
  const disabled = useDndState((x) => x.disabled[sectionId]);
  const setDisabled = useDndState((x) => x.setDisabled);

  function activeIdInAncestorSet(activeId) {
    let parentId = getSectionParentId(sectionId);
    while (parentId) {
      if (activeId === parentId) {
        return true;
      }
      parentId = getSectionParentId(parentId);
    }
    return false;
  }

  function disableSort({ active }) {
    const containerId = active.data.current.sortable?.containerId;

    // Freely moving this section or ancestor of this section
    if (
      isMovingFree &&
      (active.id === sectionId || activeIdInAncestorSet(active.id))
    ) {
      setDisabled(sectionId, { draggable: true, droppable: true });
    }
    // Freely moving a child of this section
    // else if (isMovingFree && containerId === sectionId) {
    //   console.log("disable", sectionId)
    //   setDisabled({ draggable: true, droppable: true });
    // }
    // Sorting a child of different section
    else if (isSorting && containerId !== sectionId) {
      setDisabled(sectionId, { draggable: true, droppable: true });
    }
  }

  function onDragDone() {
    setDisabled(sectionId, { draggable: false, droppable: false });
  }

  useDndMonitor({
    onDragStart: disableSort,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return disabled ?? { draggable: false, droppable: false };
}

export function useDndProps({ sectionId, isTopLevel }) {
  const hasNested = useTempHasNested(sectionId);

  return {
    id: sectionId,
    data: { isTopLevel, hasNested },
  };
}

export function useOverIsSelf(sectionId) {
  return useDndState((x) => x.overId === sectionId);
}
