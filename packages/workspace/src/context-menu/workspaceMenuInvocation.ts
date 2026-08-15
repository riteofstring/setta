import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { useReactFlow } from "../canvas/store";
import { getActiveSectionIds } from "../document/activeSections";
import { getSectionOrThrow } from "../document/documentSelectors";
import { getItemOrThrow } from "../document/itemTree";
import { useWorkspaceDocument } from "../document/stores";
import type { Position, WorkspaceItem, WorkspaceSection } from "../document/types";
import { getElementTextDirection } from "../styles/textDirection";
import {
  clientPointToWorkspacePosition,
  type WorkspaceMenuClientPoint,
} from "./workspaceMenuGeometry";
import { getWorkspaceCreationCommands, getWorkspaceMenuActions } from "./workspaceMenuRegistry";
import { publishWorkspaceMenuInvocation } from "./workspaceMenuState";
import type {
  WorkspaceItemMenuActionContext,
  WorkspaceOutlineMenuActionContext,
  WorkspacePaneMenuActionContext,
  WorkspaceSectionMenuActionContext,
} from "./workspaceMenuTypes";

function freezeSnapshot<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freezeSnapshot(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function cloneFrozen<T>(value: T): T {
  return freezeSnapshot(structuredClone(value));
}

function getWorkspacePosition(clientPoint: WorkspaceMenuClientPoint): Position {
  const { domNode, transform } = useReactFlow.getState();
  if (!domNode) {
    throw new Error("Workspace pane menu cannot open before the canvas DOM is initialized.");
  }
  return clientPointToWorkspacePosition(clientPoint, domNode.getBoundingClientRect(), {
    x: transform[0],
    y: transform[1],
    zoom: transform[2],
  });
}

function getSelectedSectionContext(sectionId: string): {
  section: WorkspaceSection;
  sectionIds: Array<string>;
  selectedSections: Array<WorkspaceSection>;
} {
  const before = getActiveSectionIds();
  if (!before.includes(sectionId)) {
    applyActiveSectionChange({
      interaction: "section-click",
      sectionId,
      multiSelectionActive: false,
    });
  }
  const state = useWorkspaceDocument.getState();
  const sectionIds = getActiveSectionIds();
  return {
    section: getSectionOrThrow(state, sectionId),
    sectionIds,
    selectedSections: sectionIds.map((id) => getSectionOrThrow(state, id)),
  };
}

export function openWorkspacePaneMenu(
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): boolean {
  if (getWorkspaceCreationCommands().length === 0 && getWorkspaceMenuActions("pane").length === 0) {
    return false;
  }
  const context = cloneFrozen<WorkspacePaneMenuActionContext>({
    scope: "pane",
    workspacePosition: getWorkspacePosition(clientPoint),
  });
  publishWorkspaceMenuInvocation({
    kind: "pane",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context,
  });
  return true;
}

export function openWorkspaceSectionMenu(
  sectionId: string,
  scope: "outline" | "section",
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): void {
  const selection = getSelectedSectionContext(sectionId);
  const context =
    scope === "section"
      ? cloneFrozen<WorkspaceSectionMenuActionContext>({
          scope,
          section: selection.section,
          selectedSections: selection.selectedSections,
        })
      : cloneFrozen<WorkspaceOutlineMenuActionContext>({
          scope,
          section: selection.section,
          selectedSections: selection.selectedSections,
        });
  publishWorkspaceMenuInvocation({
    kind: "section",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context,
    sectionIds: Object.freeze([...selection.sectionIds]),
  });
}

export function openWorkspaceSelectionMenu(
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): void {
  const sectionId = getActiveSectionIds().at(-1);
  if (!sectionId) {
    throw new Error("Workspace selection menu requires at least one selected section.");
  }
  openWorkspaceSectionMenu(sectionId, "section", clientPoint, owner);
}

export function openWorkspaceItemMenu(
  sectionId: string,
  itemId: string,
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): boolean {
  if (getWorkspaceMenuActions("item").length === 0) {
    return false;
  }
  const state = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(state, sectionId);
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(`Workspace item menu section ${sectionId} has no item tree.`);
  }
  const item: WorkspaceItem = getItemOrThrow(itemTree, itemId);
  const context = cloneFrozen<WorkspaceItemMenuActionContext>({ scope: "item", section, item });
  publishWorkspaceMenuInvocation({
    kind: "item",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context,
  });
  return true;
}
