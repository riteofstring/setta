import { useDndMonitor } from "forks/dnd-kit/adapter";
import {
  setDndDisabled,
  useDndMode,
  useDndState,
} from "forks/dnd-kit/dndState";
import _ from "lodash";
import { useEffect } from "react";
import { useProjectState } from "state/definitions";
import { useSectionImplIsFrozen } from "state/hooks/sectionVariants";
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
              backgroundColor: "rgba(185, 28, 28, 0.2)",
            }
          : {},
    };
  }, _.isEqual);
}

export function useDisableSortable(sectionId: string) {
  const { isSorting, isMovingFree } = useDndMode();
  const implIsFrozen = useSectionImplIsFrozen(sectionId);
  const disabled = useDndState(
    (x) => x.disabled[sectionId] ?? resolveDisabledState(implIsFrozen),
  );

  useEffect(() => {
    setDndDisabled(sectionId, resolveDisabledState(implIsFrozen));
  }, [implIsFrozen, sectionId]);

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

  function resetDisabledState() {
    setDndDisabled(sectionId, resolveDisabledState(implIsFrozen));
  }

  function enableSort({ active }) {
    if (
      shouldEnableSort({
        sectionId,
        activeId: String(active.id),
        activeContainerId: active.data?.current?.sortable?.containerId,
        activeIdInAncestorSet: activeIdInAncestorSet(String(active.id)),
        implIsFrozen,
        isMovingFree,
        isSorting,
      })
    ) {
      setDndDisabled(sectionId, { draggable: false, droppable: false });
    }
  }

  function onDragDone() {
    resetDisabledState();
  }

  useDndMonitor({
    onDragStart: enableSort,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return disabled;
}

function resolveDisabledState(implIsFrozen: boolean) {
  return { draggable: implIsFrozen, droppable: true };
}

function shouldEnableSort({
  sectionId,
  activeId,
  activeContainerId,
  activeIdInAncestorSet,
  implIsFrozen,
  isMovingFree,
  isSorting,
}: {
  sectionId: string;
  activeId: string;
  activeContainerId: string | number | undefined;
  activeIdInAncestorSet: boolean;
  implIsFrozen: boolean;
  isMovingFree: boolean;
  isSorting: boolean;
}) {
  if (implIsFrozen) {
    return false;
  }

  const freeMoveSortEnabled =
    isMovingFree && activeId !== sectionId && !activeIdInAncestorSet;
  const childSortEnabled = isSorting && activeContainerId === sectionId;
  return freeMoveSortEnabled || childSortEnabled;
}

export function useDndProps({ sectionId, isTopLevel }) {
  // We only want to set disabled if positionAndSizeLocked is true.
  // If positionAndSizeLocked is false, we don't want to set disabled to false,
  // so we leave it undefined to avoid forcing a value.
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
        : undefined,
    };
  }, _.isEqual);

  return {
    id: sectionId,
    data: { type: "section", isTopLevel, hasNested, onlyChildId },
    disabled,
  };
}
