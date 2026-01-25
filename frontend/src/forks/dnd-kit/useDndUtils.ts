import { useDndMonitor } from "forks/dnd-kit/CustomCore";
import {
  setDndDisabled,
  useDndMode,
  useDndState,
} from "forks/dnd-kit/dndState";
import _ from "lodash";
import { useEffect } from "react";
import { useProjectState } from "state/definitions";
import { useSectionImplIsFrozen } from "state/hooks/sectionVariants";
import colors from "tailwindcss/colors";
import { BehaviorDropTypeEnum } from "./dropTypes";

export function useHighlightDroppable({ sectionId, isGroup }) {
  const padding = !isGroup ? "0.75rem" : "";
  const margin = !isGroup ? "-0.75rem" : "";
  return useDndState((x) => {
    const behaviorDropType = x.overId === sectionId ? x.behaviorDropType : null;
    return {
      behaviorDropType,
      style:
        behaviorDropType === BehaviorDropTypeEnum.INVALID
          ? {
              borderRadius: "1.5rem",
              padding: padding,
              margin: margin,
              backgroundColor: colors.red[600],
            }
          : {},
    };
  }, _.isEqual);
}

export function useDisableSortable(sectionId: string) {
  const { isSorting, isMovingFree } = useDndMode();
  const implIsFrozen = useSectionImplIsFrozen(sectionId);
  const disabled = useDndState(
    (x) =>
      x.disabled[sectionId] ?? { draggable: implIsFrozen, droppable: true },
  );

  useEffect(() => {
    setDndDisabled(sectionId, {
      draggable: implIsFrozen,
      droppable: true,
    });
  }, [implIsFrozen]);

  function activeIdInAncestorSet(activeId: string) {
    const state = useProjectState.getState();
    let parentId = state.parentSectionMap[sectionId];
    while (parentId) {
      if (activeId === parentId) {
        return true;
      }
      parentId = state.parentSectionMap[parentId];
    }
    return false;
  }

  function enableSort({ active }) {
    if (implIsFrozen) {
      return;
    }

    // Freely moving a section outside of the current section and its children
    if (
      isMovingFree &&
      active.id !== sectionId &&
      !activeIdInAncestorSet(active.id)
    ) {
      setDndDisabled(sectionId, { draggable: false, droppable: false });
    }
    // Sorting a child of this section
    else if (
      isSorting &&
      active.data.current.sortable?.containerId === sectionId
    ) {
      setDndDisabled(sectionId, { draggable: false, droppable: false });
    }
  }

  function onDragDone() {
    setDndDisabled(sectionId, { draggable: implIsFrozen, droppable: true });
  }

  useDndMonitor({
    onDragStart: enableSort,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return disabled;
}

export function useDndProps({ sectionId, isTopLevel }) {
  // We only want to set disabled if positionAndSizeLocked is true.
  // If positionAndSizeLocked is false, we don't want to set disabled to false,
  // so we set it to null instead so that the disabled
  // status defers to dnd-kit's "global" disabled status.
  // "onlyChildId" is the id of the child if the parent has just 1 child.
  // It is needed to correctly trigger the leftDistCondition in collisionDetection.
  const { hasNested, disabled, onlyChildId } = useProjectState((x) => {
    const variantId = x.sections[sectionId]?.variantId;
    const children = variantId ? x.variants[variantId].children : [];
    return {
      hasNested: children.length > 0,
      onlyChildId: children.length === 1 ? children[0] : null,
      disabled: x.sections[sectionId]?.positionAndSizeLocked
        ? x.sections[sectionId]?.positionAndSizeLocked
        : null,
    };
  }, _.isEqual);

  return {
    id: sectionId,
    data: { isTopLevel, hasNested, onlyChildId },
    disabled,
  };
}
