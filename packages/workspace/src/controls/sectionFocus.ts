import { useReactFlow } from "../canvas/store";
import { getTopLevelSectionIdsForDisplay } from "../document/documentSelectors";
import { useWorkspaceDocument, type WorkspaceDocumentState } from "../document/stores";
import { useSectionRefs } from "../section/sectionRefs";

type SectionControlKeyboardEvent = {
  key: string;
  code: string;
  stopPropagation: () => void;
};

// The reference's `focusOnSection(null, sectionId, false)` without its pane-move travel —
// canvas focus/fit helpers are a deferred capability. Every built-in control routes its Escape
// here: moving focus to the section container blurs the live control, which restores the idle
// presentation without unselecting the section.
export function focusSectionAfterEscape(sectionId: string) {
  const sectionRef = getSectionFocusElement(sectionId);
  if (!sectionRef) {
    return;
  }
  sectionRef.focus({ preventScroll: true });
}

function getSectionFocusElement(sectionId: string): HTMLElement | null | undefined {
  const refs = useSectionRefs.getState();
  // Leaves expose their named, pressed shell through selfOnly; groups have only the named outer
  // container. Both are stable programmatic focus targets without adding a Tab stop.
  return refs.selfOnly[sectionId] ?? refs.withNested[sectionId];
}

// Escape belongs to the focused control first. Keep the same keypress from reaching the
// document-level canvas shortcut, which would immediately clear the section selection and blur
// the focus target this helper just restored.
export function handleSectionControlEscape(
  event: SectionControlKeyboardEvent,
  sectionId: string,
): boolean {
  if (event.key !== "Escape" && event.code !== "Escape") {
    return false;
  }
  event.stopPropagation();
  focusSectionAfterEscape(sectionId);
  return true;
}

export function resolveSectionFocusAfterRemoval(
  state: WorkspaceDocumentState,
  sectionId: string,
): string | null {
  if (!state.sections[sectionId]) {
    throw new Error(`Cannot resolve removal focus for unknown section ${sectionId}.`);
  }
  const parentId = state.parentSectionMap[sectionId] ?? null;
  let siblings: Array<string>;
  if (parentId) {
    const parent = state.sections[parentId];
    if (!parent) {
      throw new Error(`Section ${sectionId} references unknown parent ${parentId}.`);
    }
    siblings = parent.children;
  } else {
    siblings = getTopLevelSectionIdsForDisplay(state);
  }
  const index = siblings.indexOf(sectionId);
  if (index === -1) {
    throw new Error(`Section ${sectionId} is missing from its rendered sibling order.`);
  }
  return siblings[index + 1] ?? siblings[index - 1] ?? parentId;
}

export function restoreFocusAfterSectionRemoval(targetSectionId: string | null): void {
  requestAnimationFrame(() => {
    if (targetSectionId) {
      const section = getSectionFocusElement(targetSectionId);
      if (!section) {
        throw new Error(`Cannot restore focus to unmounted section ${targetSectionId}.`);
      }
      section.focus({ preventScroll: true });
      return;
    }
    const pane = useReactFlow.getState().domNode?.querySelector<HTMLElement>(".react-flow__pane");
    if (!pane) {
      throw new Error("Cannot restore focus after section removal without a mounted canvas pane.");
    }
    pane.focus({ preventScroll: true });
  });
}

export function captureSectionRemovalFocusTarget(sectionId: string): string | null {
  return resolveSectionFocusAfterRemoval(useWorkspaceDocument.getState(), sectionId);
}
