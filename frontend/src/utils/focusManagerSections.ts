import { movePaneToIncludeElement } from "forks/xyflow/core/utils/graph";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionEffectiveImpls";
import { useProjectState } from "state/definitions";
import { useSectionRefs } from "state/stores/layoutInteractionStores";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  getCurrentTopLevelSectionId,
  getFocusableElements,
  getOrderedTopLevelSectionIds,
  isElementInScope,
} from "./focusManagerElements";

export function focusAdjacentTopLevelSection({
  direction,
  focusOnFirstElement = true,
  setActive = true,
}: {
  direction: 1 | -1;
  focusOnFirstElement?: boolean;
  setActive?: boolean;
}): boolean {
  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (!isElementInScope(activeElement, "canvas")) {
    return false;
  }
  const orderedSectionIds = getOrderedTopLevelSectionIds();
  if (orderedSectionIds.length === 0) {
    return false;
  }
  const currentId = getCurrentTopLevelSectionId(
    activeElement,
    orderedSectionIds,
  );
  let nextIndex = direction > 0 ? 0 : orderedSectionIds.length - 1;
  if (currentId) {
    const currentIndex = orderedSectionIds.indexOf(currentId);
    if (currentIndex !== -1) {
      nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= orderedSectionIds.length) {
        return false;
      }
    }
  }
  const targetId = orderedSectionIds[nextIndex];
  if (!targetId) {
    return false;
  }
  if (setActive) {
    applyActiveSectionChange({ interaction: "go-to", sectionId: targetId });
  }
  focusOnSection(null, targetId, focusOnFirstElement);
  return true;
}

export function focusOnSection(
  event: KeyboardEvent | null,
  sectionId: string,
  focusOnFirstElement = true,
) {
  event?.preventDefault();
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  const refs = useSectionRefs.getState();

  if (impl.type === SectionTypeEnum.Group) {
    const groupRef = refs.withNested[sectionId];
    if (!groupRef) {
      return;
    }
    groupRef.focus({ preventScroll: true });
    movePaneToIncludeElement(groupRef);
    return;
  }

  if (focusOnFirstElement) {
    const sectionRoot = refs.selfOnly[sectionId];
    const firstFocusable = sectionRoot
      ? getFocusableElements(sectionRoot)[0]
      : null;
    if (firstFocusable) {
      firstFocusable.focus({ preventScroll: true });
      movePaneToIncludeElement(firstFocusable);
      return;
    }
  }

  const sectionRef = refs.withNested[sectionId];
  if (!sectionRef) {
    return;
  }
  sectionRef.focus({ preventScroll: true });
  movePaneToIncludeElement(sectionRef);
}
