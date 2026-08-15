import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { useReactFlow } from "../canvas/store";
import { getActiveSectionIds } from "../document/activeSections";
import { getSectionOrThrow } from "../document/documentSelectors";
import { getItemOrThrow } from "../document/itemTree";
import { useWorkspaceDocument } from "../document/stores";
import type { Position, WorkspaceItem, WorkspaceSection } from "../document/types";
import { cloneFrozenWorkspaceSnapshot } from "../document/workspaceSnapshot";
import { getElementTextDirection } from "../styles/textDirection";
import {
  clientPointToWorkspacePosition,
  type WorkspaceMenuClientPoint,
} from "./workspaceMenuGeometry";
import { getWorkspaceCreationCommands, getWorkspaceMenuActions } from "./workspaceMenuRegistry";
import {
  publishWorkspaceMenuInvocation,
  type WorkspaceMenuInitialFocus,
  type WorkspaceSectionMenuSurface,
} from "./workspaceMenuState";
import type {
  WorkspaceItemMenuActionContext,
  WorkspaceOutlineMenuActionContext,
  WorkspacePaneMenuActionContext,
  WorkspaceSectionMenuActionContext,
} from "./workspaceMenuTypes";

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
  const context = cloneFrozenWorkspaceSnapshot<WorkspacePaneMenuActionContext>({
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

type WorkspaceSectionMenuInput = {
  sectionId: string;
  scope: "outline" | "section";
  clientPoint: WorkspaceMenuClientPoint;
  owner: HTMLElement;
  surface: WorkspaceSectionMenuSurface;
  initialFocus: WorkspaceMenuInitialFocus;
};

function publishWorkspaceSectionMenu({
  sectionId,
  scope,
  clientPoint,
  owner,
  surface,
  initialFocus,
}: WorkspaceSectionMenuInput): void {
  const selection = getSelectedSectionContext(sectionId);
  const context =
    scope === "section"
      ? cloneFrozenWorkspaceSnapshot<WorkspaceSectionMenuActionContext>({
          scope,
          section: selection.section,
          selectedSections: selection.selectedSections,
        })
      : cloneFrozenWorkspaceSnapshot<WorkspaceOutlineMenuActionContext>({
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
    initialFocus,
    sectionIds: Object.freeze([...selection.sectionIds]),
    surface,
  });
}

export function openWorkspaceSectionMenu(
  sectionId: string,
  scope: "outline" | "section",
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): void {
  publishWorkspaceSectionMenu({
    sectionId,
    scope,
    clientPoint,
    owner,
    surface: "context-menu",
    initialFocus: "first",
  });
}

export function openWorkspaceSectionHeaderMenu(
  sectionId: string,
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
  initialFocus: WorkspaceMenuInitialFocus = "first",
): void {
  publishWorkspaceSectionMenu({
    sectionId,
    scope: "section",
    clientPoint,
    owner,
    surface: "header",
    initialFocus,
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
  const state = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(state, sectionId);
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(`Workspace item menu section ${sectionId} has no item tree.`);
  }
  const item: WorkspaceItem = getItemOrThrow(itemTree, itemId);
  const context = cloneFrozenWorkspaceSnapshot<WorkspaceItemMenuActionContext>({
    scope: "item",
    section,
    item,
  });
  publishWorkspaceMenuInvocation({
    kind: "item",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context,
  });
  return true;
}
