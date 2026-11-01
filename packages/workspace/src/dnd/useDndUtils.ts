import { useEffect } from "react";
import {
  getWorkspaceDocumentStore,
  useWorkspaceDocument,
} from "../document/stores.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import { useDndMonitor, type Disabled } from "./adapter/index.js";
import { useDndChildren } from "./dndChildren.js";
import { getDndStateStore, setDndDisabled, useDndState } from "./dndState.js";
import { BehaviorDropTypeEnum } from "./dropTypes.js";
import { deepEqual } from "../state/deepEqual.js";

export function useHasTempNested(sectionId: string) {
  return useDndChildren((x) => (x.x[sectionId] ?? []).length > 0);
}

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
  }, deepEqual);
}

const defaultDisabledState: Disabled = { draggable: false, droppable: true };

export function useDisableSortable(sectionId: string): Disabled {
  const host = useWorkspaceHost();
  const disabled = useDndState(
    (x) => x.disabled[sectionId] ?? defaultDisabledState,
  );

  useEffect(() => {
    setDndDisabled(host, sectionId, defaultDisabledState);
  }, [host, sectionId]);

  function activeIdInAncestorSet(activeId: string) {
    const state = getWorkspaceDocumentStore(host).getState();
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
    setDndDisabled(host, sectionId, defaultDisabledState);
  }

  function enableSort({
    active,
  }: {
    active: { id: string | number; data?: { current?: unknown } };
  }) {
    const mode = getDndStateStore(host).getState();
    const activeData = active.data?.current as
      { sortable?: { containerId?: string | number } } | undefined;
    if (
      shouldEnableSort({
        sectionId,
        activeId: String(active.id),
        activeContainerId: activeData?.sortable?.containerId,
        activeIdInAncestorSet: activeIdInAncestorSet(String(active.id)),
        isMovingFree: mode.isMovingFree || !mode.isSorting,
        isSorting: mode.isSorting,
      })
    ) {
      setDndDisabled(host, sectionId, { draggable: false, droppable: false });
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
  }, deepEqual);

  return {
    id: sectionId,
    data: { type: "section", isTopLevel, hasNested, onlyChildId },
    disabled,
  };
}
