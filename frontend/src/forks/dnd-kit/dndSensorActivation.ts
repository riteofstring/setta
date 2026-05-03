import { NO_DRAG_CLASS_NAME } from "utils/constants";
import {
  selectionDragHandle,
  selectionDragPrimaryId,
} from "./selectionDragHandle";

export type DndSource = {
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

export type DndModeSnapshot = {
  readonly isMovingFree: boolean;
  readonly isSorting: boolean;
};

function getDragType(source: DndSource): string | null {
  return source.data?.current?.type ?? null;
}

function getIsTopLevel(source: DndSource): boolean {
  return Boolean(source.data?.current?.isTopLevel);
}

function eventTargetsNoDragElement(event: Event, source: DndSource): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  const noDragElement = target.closest(`.${NO_DRAG_CLASS_NAME}`);
  return Boolean(
    noDragElement && !isSourceOwnedNoDragElement(noDragElement, source),
  );
}

function isSourceOwnedNoDragElement(
  noDragElement: Element,
  source: DndSource,
): boolean {
  if (noDragElement === source.element || noDragElement === source.handle) {
    return true;
  }

  const sourceSectionId = String(source.id);
  if (noDragElement.getAttribute("data-section-id") === sourceSectionId) {
    return true;
  }

  return Array.from(noDragElement.querySelectorAll("[data-section-id]")).some(
    (element) => element.getAttribute("data-section-id") === sourceSectionId,
  );
}

export function getSectionDndActivatorElements(source: DndSource) {
  const baseTarget = source.handle ?? source.element;
  const handleElement = selectionDragHandle.value;
  const primaryId = selectionDragPrimaryId.value;
  if (handleElement && primaryId && String(source.id) === String(primaryId)) {
    return [baseTarget, handleElement];
  }
  return [baseTarget];
}

export function shouldPreventSectionDndActivation(
  event: Event,
  source: DndSource,
  dndMode: DndModeSnapshot,
): boolean {
  if (getDragType(source) !== "section") {
    return true;
  }

  if (eventTargetsNoDragElement(event, source)) {
    return true;
  }

  const isTopLevel = getIsTopLevel(source);
  if (dndMode.isMovingFree) {
    return false;
  }

  if (dndMode.isSorting && !isTopLevel) {
    return false;
  }

  return true;
}
