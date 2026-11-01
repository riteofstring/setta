import { getReactFlowStore } from "../canvas/store.js";
import {
  getVisibleSectionChildrenForDisplay,
  getVisibleTopLevelSectionIdsForDisplay,
} from "../document/savedViewDisplay.js";
import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores.js";
import { getSectionRefsStore } from "../section/sectionRefs.js";
import type { WorkspaceHost } from "../workspaceHost.js";

type SectionControlKeyboardEvent = {
  key: string;
  code: string;
  stopPropagation: () => void;
};

export function focusSectionAfterEscape(
  host: WorkspaceHost,
  sectionId: string,
) {
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

  return refs.selfOnly[sectionId] ?? refs.withNested[sectionId];
}

function getCanvasPane(host: WorkspaceHost): HTMLElement | null {
  return (
    getReactFlowStore(host)
      .getState()
      .domNode?.querySelector<HTMLElement>(".react-flow__pane") ?? null
  );
}

export function captureSectionGroupingFocus(
  host: WorkspaceHost,
  groupedSectionIds: ReadonlyArray<string>,
): HTMLElement | null {
  if (
    typeof document === "undefined" ||
    !(document.activeElement instanceof HTMLElement)
  ) {
    return null;
  }
  const canvas = getReactFlowStore(host).getState().domNode;
  if (!canvas?.contains(document.activeElement)) {
    return null;
  }
  if (document.activeElement.matches(".react-flow__nodesselection-rect")) {
    return document.activeElement;
  }
  const refs = getSectionRefsStore(host).getState();
  return groupedSectionIds.some((sectionId) =>
    (refs.selfOnly[sectionId] ?? refs.withNested[sectionId])?.contains(
      document.activeElement,
    ),
  )
    ? document.activeElement
    : null;
}

export function restoreFocusAfterSectionGrouping(
  host: WorkspaceHost,
  previousFocus: HTMLElement | null,
): void {
  if (!previousFocus || typeof document === "undefined") {
    return;
  }
  const activeElement = document.activeElement;
  if (
    activeElement !== previousFocus &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
  ) {
    return;
  }
  const pane = getCanvasPane(host);
  if (!pane) {
    return;
  }
  pane.focus({ preventScroll: true });
}

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
    siblings = getVisibleSectionChildrenForDisplay(state, parentId);
  } else {
    siblings = getVisibleTopLevelSectionIdsForDisplay(state);
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
    const pane = getCanvasPane(host);
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
