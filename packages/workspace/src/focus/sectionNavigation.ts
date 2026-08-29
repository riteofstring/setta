import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { movePaneToIncludeElement } from "../canvas/viewportHelpers";
import { isGroupSection } from "../document/documentSelectors";
import { getWorkspaceDocumentStore } from "../document/stores";
import { getSectionRefsStore } from "../section/sectionRefs";
import type { WorkspaceHost } from "../workspaceHost";
import { isWorkspaceHostElement } from "../workspaceHostInternals";
import { getOrderedTopLevelSectionIds } from "./topLevelSectionOrder";
import {
  getWorkspaceFocusableElements,
  getWorkspaceFocusScopeId,
} from "./workspaceFocusScopes";

function getFocusedCanvasSectionId(
  host: WorkspaceHost,
  orderedSectionIds: ReadonlyArray<string>,
): string | null {
  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (
    !activeElement ||
    !isWorkspaceHostElement(host, activeElement) ||
    getWorkspaceFocusScopeId(activeElement) !== "canvas"
  ) {
    return null;
  }
  const sectionNode = activeElement.closest(".react-flow__node");
  const sectionId = sectionNode?.getAttribute("data-id") ?? null;
  return sectionId !== null && orderedSectionIds.includes(sectionId)
    ? sectionId
    : null;
}

function getAdjacentTopLevelSectionId(
  host: WorkspaceHost,
  orderedSectionIds: ReadonlyArray<string>,
  direction: 1 | -1,
): string | null {
  const currentId = getFocusedCanvasSectionId(host, orderedSectionIds);
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

function resolveSectionFocusTarget(
  host: WorkspaceHost,
  sectionId: string,
): HTMLElement | null {
  const section =
    getWorkspaceDocumentStore(host).getState().sections[sectionId];
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
  const targetId = getAdjacentTopLevelSectionId(
    host,
    orderedSectionIds,
    direction,
  );
  if (targetId === null) {
    return false;
  }

  const target = resolveSectionFocusTarget(host, targetId);
  if (!target) {
    return false;
  }
  applyActiveSectionChange(host, { interaction: "go-to", sectionId: targetId });
  target.focus({ preventScroll: true });
  movePaneToIncludeElement(host, target);
  return true;
}
