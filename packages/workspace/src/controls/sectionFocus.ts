import { getReactFlowStore } from "../canvas/store";
import { getTopLevelSectionIdsForDisplay } from "../document/documentSelectors";
import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores";
import { getSectionRefsStore } from "../section/sectionRefs";
import type { WorkspaceHost } from "../workspaceHost";

type SectionControlKeyboardEvent = {
  key: string;
  code: string;
  stopPropagation: () => void;
};

// The reference's `focusOnSection(null, sectionId, false)` without its pane-move travel —
// canvas focus/fit helpers are a deferred capability. Every built-in control routes its Escape
// here: moving focus to the section container blurs the live control, which restores the idle
// presentation without unselecting the section.
export function focusSectionAfterEscape(host: WorkspaceHost, sectionId: string) {
  const sectionRef = getSectionFocusElement(host, sectionId);
  if (!sectionRef) {
    return;
  }
  sectionRef.focus({ preventScroll: true });
}

function getSectionFocusElement(
  host: WorkspaceHost,
  sectionId: string,
): HTMLElement | null | undefined {
  const refs = getSectionRefsStore(host).getState();
  // Leaves expose their named section group through selfOnly; groups have only the named outer
  // container. Both are stable programmatic focus targets without adding a Tab stop.
  return refs.selfOnly[sectionId] ?? refs.withNested[sectionId];
}

// Escape belongs to the focused control first. Keep the same keypress from reaching the
// document-level canvas shortcut, which would immediately clear the section selection and blur
// the focus target this helper just restored.
export function handleSectionControlEscape(
  host: WorkspaceHost,
  event: SectionControlKeyboardEvent,
  sectionId: string,
): boolean {
  if (event.key !== "Escape" && event.code !== "Escape") {
    return false;
  }
  event.stopPropagation();
  focusSectionAfterEscape(host, sectionId);
  return true;
}

export function resolveSectionFocusAfterRemoval(
  state: WorkspaceDocumentState,
  sectionId: string,
): string | null {
  if (!state.sections[sectionId]) {
    throw new Error(
      `Cannot resolve removal focus for unknown section ${sectionId}.`,
    );
  }
  const parentId = state.parentSectionMap[sectionId] ?? null;
  let siblings: Array<string>;
  if (parentId) {
    const parent = state.sections[parentId];
    if (!parent) {
      throw new Error(
        `Section ${sectionId} references unknown parent ${parentId}.`,
      );
    }
    siblings = parent.children;
  } else {
    siblings = getTopLevelSectionIdsForDisplay(state);
  }
  const index = siblings.indexOf(sectionId);
  if (index === -1) {
    throw new Error(
      `Section ${sectionId} is missing from its rendered sibling order.`,
    );
  }
  return siblings[index + 1] ?? siblings[index - 1] ?? parentId;
}

export function restoreFocusAfterSectionRemoval(
  host: WorkspaceHost,
  targetSectionId: string | null,
): void {
  requestAnimationFrame(() => {
    if (targetSectionId) {
      const section = getSectionFocusElement(host, targetSectionId);
      if (!section) {
        throw new Error(
          `Cannot restore focus to unmounted section ${targetSectionId}.`,
        );
      }
      section.focus({ preventScroll: true });
      return;
    }
    const pane = getReactFlowStore(host)
      .getState()
      .domNode?.querySelector<HTMLElement>(".react-flow__pane");
    if (!pane) {
      throw new Error(
        "Cannot restore focus after section removal without a mounted canvas pane.",
      );
    }
    pane.focus({ preventScroll: true });
  });
}

export function captureSectionRemovalFocusTarget(
  host: WorkspaceHost,
  sectionId: string,
): string | null {
  return resolveSectionFocusAfterRemoval(
    getWorkspaceDocumentStore(host).getState(),
    sectionId,
  );
}
