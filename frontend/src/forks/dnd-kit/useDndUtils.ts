import type { Disabled } from "forks/dnd-kit/adapter";
import { useProjectState } from "state/definitions";
import { useSectionImplIsFrozen } from "state/hooks/sectionVariants";

export function useSectionDndDisabled(sectionId: string): boolean {
  const positionAndSizeLocked = useProjectState((state) => {
    const section = state.sections[sectionId];
    if (!section) {
      throw new Error(`Missing section ${sectionId}`);
    }
    return Boolean(section.positionAndSizeLocked);
  });
  const implIsFrozen = useSectionImplIsFrozen(sectionId);
  return positionAndSizeLocked || implIsFrozen;
}

export function useDisableSortable(sectionId: string): Disabled {
  const disabled = useSectionDndDisabled(sectionId);
  return {
    draggable: disabled,
    droppable: disabled,
  };
}

export function useDndProps(sectionId: string) {
  const disabled = useSectionDndDisabled(sectionId);
  return {
    id: sectionId,
    disabled: disabled || undefined,
  };
}
