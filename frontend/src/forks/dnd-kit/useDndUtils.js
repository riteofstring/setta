import { useDndMonitor } from "forks/dnd-kit/CustomCore";
import { useDndMode, useDndState } from "forks/dnd-kit/dndState";
import { BehaviorDropType } from "forks/dnd-kit/dropTypes";
import { useEffect } from "react";
import { getSectionParentId } from "state/getters/sectionInfo";
import { useSectionVariantIsFrozen } from "state/hooks/sectionVariants";
import colors from "tailwindcss/colors";
import { useHasPermanentNested } from "../../state/hooks/sections";

export function useHighlightDroppable(sectionId) {
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
        // transition: "background-color 0.2s",
        backgroundColor: invalid ? colors.red[600] : colors.blue[500],
      }
    : {};

  return {
    style,
    behaviorDropType,
  };
}

export function useDisableSortable(sectionId) {
  const { isSorting, isMovingFree } = useDndMode();
  const disabled = useDndState((x) => x.disabled[sectionId]);
  const setDisabled = useDndState((x) => x.setDisabled);
  const variantIsDisabled = useSectionVariantIsFrozen(sectionId);

  useEffect(() => {
    setDisabled(sectionId, {
      draggable: variantIsDisabled,
      droppable: true,
    });
  }, [variantIsDisabled]);

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

  function enableSort({ active }) {
    if (variantIsDisabled) {
      return;
    }

    // Freely moving a section outside of the current section and its children
    if (
      isMovingFree &&
      active.id !== sectionId &&
      !activeIdInAncestorSet(active.id)
    ) {
      setDisabled(sectionId, { draggable: false, droppable: false });
    }
    // Sorting a child of this section
    else if (
      isSorting &&
      active.data.current.sortable?.containerId === sectionId
    ) {
      setDisabled(sectionId, { draggable: false, droppable: false });
    }
  }

  function onDragDone() {
    setDisabled(sectionId, { draggable: variantIsDisabled, droppable: true });
  }

  useDndMonitor({
    onDragStart: enableSort,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return disabled ?? { draggable: variantIsDisabled, droppable: true };
}

export function useDndProps({ sectionId, isTopLevel }) {
  const hasNested = useHasPermanentNested(sectionId);

  return {
    id: sectionId,
    data: { isTopLevel, hasNested },
  };
}

export function useOverIsSelf(sectionId) {
  return useDndState((x) => x.overId === sectionId);
}
