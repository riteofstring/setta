import _ from "lodash";
import { useEffect } from "react";
import { useWorkspaceDocument } from "../document/stores";
import { useDndMonitor, type Disabled } from "./adapter";
import { useDndChildren } from "./dndChildren";
import { setDndDisabled, useDndMode, useDndState } from "./dndState";
import { BehaviorDropTypeEnum } from "./dropTypes";

// The reference keeps this beside the container chrome (`Container/utils.tsx`); it reads the
// live dnd children projection so temp placeholders count as nested content.
export function useHasTempNested(sectionId: string) {
  return useDndChildren((x) => (x.x[sectionId] ?? []).length > 0);
}

// The reference's `useDndUtils.ts` minus its variant freezing: the package document is resolved,
// so the reference's frozen-impl draggable gate has no package-side state and sortables default
// to draggable.

export function useHighlightDroppable({
  sectionId,
  isGroup,
}: {
  sectionId: string;
  isGroup: boolean;
}) {
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

const defaultDisabledState: Disabled = { draggable: false, droppable: true };

export function useDisableSortable(sectionId: string): Disabled {
  const { isSorting, isMovingFree } = useDndMode();
  const disabled = useDndState(
    (x) => x.disabled[sectionId] ?? defaultDisabledState,
  );

  useEffect(() => {
    setDndDisabled(sectionId, defaultDisabledState);
  }, [sectionId]);

  function activeIdInAncestorSet(activeId: string) {
    const state = useWorkspaceDocument.getState();
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
    setDndDisabled(sectionId, defaultDisabledState);
  }

  function enableSort({
    active,
  }: {
    active: { id: string | number; data?: { current?: unknown } };
  }) {
    const activeData = active.data?.current as
      { sortable?: { containerId?: string | number } } | undefined;
    if (
      shouldEnableSort({
        sectionId,
        activeId: String(active.id),
        activeContainerId: activeData?.sortable?.containerId,
        activeIdInAncestorSet: activeIdInAncestorSet(String(active.id)),
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

function shouldEnableSort({
  sectionId,
  activeId,
  activeContainerId,
  activeIdInAncestorSet,
  isMovingFree,
  isSorting,
}: {
  sectionId: string;
  activeId: string;
  activeContainerId: string | number | undefined;
  activeIdInAncestorSet: boolean;
  isMovingFree: boolean;
  isSorting: boolean;
}) {
  const freeMoveSortEnabled =
    isMovingFree && activeId !== sectionId && !activeIdInAncestorSet;
  const childSortEnabled = isSorting && activeContainerId === sectionId;
  return freeMoveSortEnabled || childSortEnabled;
}

export function useDndProps({
  sectionId,
  isTopLevel,
}: {
  sectionId: string;
  isTopLevel: boolean;
}) {
  // We only want to set disabled if positionAndSizeLocked is true.
  // If positionAndSizeLocked is false, we don't want to set disabled to false,
  // so we leave it undefined to avoid forcing a value.
  // "onlyChildId" is the id of the child if the parent has just 1 child.
  // It is needed to correctly trigger the leftDistCondition in collisionDetection.
  const { hasNested, disabled, onlyChildId } = useWorkspaceDocument((x) => {
    const section = x.sections[sectionId];
    const children = section ? section.children : [];
    return {
      hasNested: children.length > 0,
      onlyChildId: children.length === 1 ? children[0] : null,
      disabled: section?.positionAndSizeLocked
        ? section.positionAndSizeLocked
        : undefined,
    };
  }, _.isEqual);

  return {
    id: sectionId,
    data: { type: "section", isTopLevel, hasNested, onlyChildId },
    disabled,
  };
}
