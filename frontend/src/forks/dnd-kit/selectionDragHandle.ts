import { signal } from "@dnd-kit/state";

export const selectionDragHandle = signal<Element | null>(null);
export const selectionDragPrimaryId = signal<string | null>(null);

export function setSelectionDragHandle(element: Element | null) {
  selectionDragHandle.value = element;
}

export function setSelectionDragPrimaryId(sectionId: string | null) {
  selectionDragPrimaryId.value = sectionId;
}
