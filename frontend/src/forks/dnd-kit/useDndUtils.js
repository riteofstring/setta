import { useDndMonitor } from "forks/dnd-kit/CustomCore";
import { useDndMode, useDndState } from "forks/dnd-kit/dndState";
import _ from "lodash";
import { useEffect } from "react";
import {
  getSectionParentId,
  getSectionVariantAttr,
} from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useSectionVariantIsFrozen } from "state/hooks/sectionVariants";
import colors from "tailwindcss/colors";
import { BehaviorDropType } from "./dropTypes";

export function useHighlightDroppable(sectionId) {
  return useDndState((x) => {
    const behaviorDropType = x.overId === sectionId ? x.behaviorDropType : null;
    return {
      behaviorDropType,
      style:
        behaviorDropType === BehaviorDropType.INVALID
          ? {
              borderRadius: "1.5rem",
              padding: "0.75rem",
              margin: "-0.75rem",
              backgroundColor: colors.red[600],
            }
          : {},
    };
  }, _.isEqual);
}

export function useDisableSortable(sectionId) {
  const { isSorting, isMovingFree } = useDndMode();
  const disabled = useDndState((x) => x.disabled[sectionId]);
  const setDisabled = useDndState((x) => x.setDisabled);
  const variantIsFrozen = useSectionVariantIsFrozen(sectionId);

  useEffect(() => {
    setDisabled(sectionId, {
      draggable: variantIsFrozen,
      droppable: true,
    });
  }, [variantIsFrozen]);

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
    if (variantIsFrozen) {
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
    setDisabled(sectionId, { draggable: variantIsFrozen, droppable: true });
  }

  useDndMonitor({
    onDragStart: enableSort,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return disabled ?? { draggable: variantIsFrozen, droppable: true };
}

export function useDndProps({ sectionId, isTopLevel }) {
  const hasNested = useHasPermanentNested(sectionId);

  return {
    id: sectionId,
    data: { isTopLevel, hasNested },
  };
}

function useHasPermanentNested(sectionId) {
  return useSectionInfos((x) => {
    const variantId = x.x[sectionId]?.variantId;
    return variantId
      ? getSectionVariantAttr(x.variants[variantId], "children").length > 0
      : false;
  });
}
