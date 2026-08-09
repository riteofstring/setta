import { KeyboardSensor, PointerSensor } from "@dnd-kit/dom";
import { useMemo } from "react";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { NO_DRAG_CLASS_NAME } from "../interaction";
import { useDndState } from "./dndState";
import { selectionDragHandle, selectionDragPrimaryId } from "./selectionDragHandle";

// The section half of the reference's `useDNDSensors.ts`; the param sensors left with the
// Phase 4 parameter/item surface. Section drags have no distance constraint — activation is
// gated purely by the held dnd mode.

type DndSource = {
  id: string | number;
  element?: Element;
  handle?: Element;
  data?: {
    current?: {
      type?: string;
      isTopLevel?: boolean;
    };
  };
};

function getIsTopLevel(source: DndSource): boolean {
  return Boolean(source.data?.current?.isTopLevel);
}

function eventTargetsNoDragElement(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(`.${NO_DRAG_CLASS_NAME}`) !== null;
}

function preventSectionActivation(event: Event, source: DndSource): boolean {
  const { isSorting, isMovingFree } = useDndState.getState();
  const isTopLevel = getIsTopLevel(source);
  if (isMovingFree) {
    return false;
  }

  if (isSorting && !isTopLevel) {
    return false;
  }

  if (eventTargetsNoDragElement(event)) {
    return true;
  }

  return true;
}

export function useSectionDndSensors() {
  const canEditLayout = useWorkspaceCapabilities((x) => x.canEditLayout);
  return useMemo(() => {
    if (!canEditLayout) {
      return [];
    }

    const pointerSensor = PointerSensor.configure({
      activatorElements: (source: DndSource) => {
        const baseTarget = source.handle ?? source.element;
        const handleElement = selectionDragHandle.value;
        const primaryId = selectionDragPrimaryId.value;
        if (handleElement && primaryId && String(source.id) === String(primaryId)) {
          return [baseTarget, handleElement];
        }
        return [baseTarget];
      },
      preventActivation: preventSectionActivation,
    });

    const keyboardSensor = KeyboardSensor.configure({
      preventActivation: preventSectionActivation,
    });

    return [pointerSensor, keyboardSensor];
  }, [canEditLayout]);
}
