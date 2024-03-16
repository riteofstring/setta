import { useDndMonitor } from "@dnd-kit/core";
import colors from "tailwindcss/colors";
import { getSectionParentId } from "thunks/sections/getters";
import { useDndState } from "utils/DNDSortable/dndState";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { useTempHasNested } from "../../hooks/useSectionChildren";
import { getDndSectionId } from "./useDropType";

export function useHighlightDroppable(sectionId: string) {
  const overIsSelf = useOverIsSelf(sectionId);
  const behaviorDropType = useDndState((x) =>
    overIsSelf ? x.behaviorDropType : null,
  );
  const invalid = behaviorDropType === BehaviorDropType.INVALID;

  const style = !invalid
    ? {}
    : {
        borderRadius: "1.5rem",
        padding: "0.75rem",
        margin: "-0.75rem",
        transition: "background-color 0.2s",
        backgroundColor: invalid ? colors.red[600] : colors.blue[500],
      };

  return {
    style,
    behaviorDropType,
  };
}

export function useDisableSortable(sectionId: string, dndSectionId: string) {
  const { isSorting, isMovingFree } = useDndState((x) => ({
    isSorting: x.isSorting,
    isMovingFree: x.isMovingFree,
  }));
  const disabled = useDndState((x) => x.disabled[dndSectionId]);
  const setDisabled = useDndState((x) => x.setDisabled);

  function activeIdInAncestorSet(activeId) {
    // use sectionId here instead of dndSectionId because we're referring to the non-temporary data structure.
    let parentId = getSectionParentId(sectionId);
    while (parentId) {
      if (activeId === getDndSectionId(parentId)) {
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
      (active.id === dndSectionId || activeIdInAncestorSet(active.id))
    ) {
      setDisabled(dndSectionId, { draggable: true, droppable: true });
    }
    // Freely moving a child of this section
    // else if (isMovingFree && containerId === sectionId) {
    //   console.log("disable", sectionId)
    //   setDisabled({ draggable: true, droppable: true });
    // }
    // Sorting a child of different section
    else if (isSorting && containerId !== dndSectionId) {
      setDisabled(dndSectionId, { draggable: true, droppable: true });
    }
  }

  function onDragDone() {
    setDisabled(dndSectionId, { draggable: false, droppable: false });
  }

  useDndMonitor({
    onDragStart: disableSort,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return disabled ?? { draggable: false, droppable: false };
}

export function useIsDraggingFreely() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  const activeIsTruthy = useDndState((x) => !!x.activeId);
  return isMovingFree && activeIsTruthy;
}

export function useDndProps({ sectionId, isTopLevel }) {
  const dndSectionId = getDndSectionId(sectionId);
  const hasNested = useTempHasNested(dndSectionId);

  return {
    id: dndSectionId,
    data: { isTopLevel, hasNested },
  };
}

export function useActiveIsSelf(sectionId) {
  return useDndState((x) => x.activeId === getDndSectionId(sectionId));
}

export function useOverIsSelf(sectionId) {
  return useDndState((x) => x.overId === getDndSectionId(sectionId));
}

export function useDndActiveAndMovingFreeInSortable(sectionId, dragListeners) {
  return useDndState(
    (x) =>
      x.activeId === getDndSectionId(sectionId) &&
      x.movingFreeInSortable &&
      !!dragListeners,
  );
}
