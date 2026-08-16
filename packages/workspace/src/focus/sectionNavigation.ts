import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { movePaneToIncludeElement } from "../canvas/viewportHelpers";
import { isGroupSection } from "../document/documentSelectors";
import { getWorkspaceDocumentStore } from "../document/stores";
import { getSectionRefsStore } from "../section/sectionRefs";
import type { WorkspaceHost } from "../workspaceHost";
import { getOrderedTopLevelSectionIds } from "./topLevelSectionOrder";
import {
  getWorkspaceFocusableElements,
  getWorkspaceFocusScopeId,
} from "./workspaceFocusScopes";

// The reference's `focusAdjacentTopLevelSection` and the `focusOnSection` it calls
// (`utils/focusManager.ts`): move along the canvas's top-level reading order from whatever the
// keyboard is currently inside, make the target the single active section, and focus it the way
// a click on it would leave focus.

function getFocusedCanvasSectionId(
  orderedSectionIds: ReadonlyArray<string>,
): string | null {
  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (!activeElement || getWorkspaceFocusScopeId(activeElement) !== "canvas") {
    return null;
  }
  const sectionNode = activeElement.closest(".react-flow__node");
  const sectionId = sectionNode?.getAttribute("data-id") ?? null;
  return sectionId !== null && orderedSectionIds.includes(sectionId)
    ? sectionId
    : null;
}

// From outside the canvas the move starts at the edge it is travelling from; from a section it
// stops at the ends of the order rather than wrapping, which is the reference's behavior.
function getAdjacentTopLevelSectionId(
  orderedSectionIds: ReadonlyArray<string>,
  direction: 1 | -1,
): string | null {
  const currentId = getFocusedCanvasSectionId(orderedSectionIds);
  if (currentId === null) {
    return (
      (direction === 1 ? orderedSectionIds[0] : orderedSectionIds.at(-1)) ??
      null
    );
  }
  return (
    orderedSectionIds[orderedSectionIds.indexOf(currentId) + direction] ?? null
  );
}

// A group is focused as a whole; a leaf hands focus to its first control, and falls back to its
// own container when it has none.
function resolveSectionFocusTarget(
  host: WorkspaceHost,
  sectionId: string,
): HTMLElement | null {
  const section = getWorkspaceDocumentStore(host).getState().sections[sectionId];
  if (!section) {
    throw new Error(`Cannot focus unknown workspace section ${sectionId}.`);
  }
  const refs = getSectionRefsStore(host).getState();
  const container = refs.withNested[sectionId] ?? null;
  if (isGroupSection(section)) {
    return container;
  }
  const sectionRoot = refs.selfOnly[sectionId];
  const firstControl = sectionRoot
    ? getWorkspaceFocusableElements(sectionRoot)[0]
    : undefined;
  return firstControl ?? container;
}

export function focusAdjacentTopLevelSection(
  host: WorkspaceHost,
  direction: 1 | -1,
): boolean {
  const orderedSectionIds = getOrderedTopLevelSectionIds(host);
  const targetId = getAdjacentTopLevelSectionId(orderedSectionIds, direction);
  if (targetId === null) {
    return false;
  }
  // An unmounted target is resolved before anything changes, so a declined move leaves the
  // active selection exactly as it was.
  const target = resolveSectionFocusTarget(host, targetId);
  if (!target) {
    return false;
  }
  applyActiveSectionChange(host, { interaction: "go-to", sectionId: targetId });
  target.focus({ preventScroll: true });
  movePaneToIncludeElement(host, target);
  return true;
}
