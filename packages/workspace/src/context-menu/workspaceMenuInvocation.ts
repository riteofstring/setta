import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { useReactFlow } from "../canvas/store";
import {
  createItemCommandContext,
  createPaneCommandContext,
  createSectionCommandContext,
} from "../commands/workspaceCommandContexts";
import { getWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { getActiveSectionIds } from "../document/activeSections";
import { getSectionOrThrow } from "../document/documentSelectors";
import { getItemOrThrow } from "../document/itemTree";
import { useWorkspaceDocument } from "../document/stores";
import type { Position, WorkspaceSection } from "../document/types";
import { getElementTextDirection } from "../styles/textDirection";
import { getWorkspaceCreationCommands } from "./creationCommandStore";
import {
  clientPointToWorkspacePosition,
  type WorkspaceMenuClientPoint,
} from "./workspaceMenuGeometry";
import {
  publishWorkspaceMenuInvocation,
  type WorkspaceMenuInitialFocus,
  type WorkspaceSectionMenuSurface,
} from "./workspaceMenuState";

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
  return {
    section: getSectionOrThrow(state, sectionId),
    selectedSections: getActiveSectionIds().map((id) => getSectionOrThrow(state, id)),
  };
}

export function openWorkspacePaneMenu(
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): boolean {
  if (
    getWorkspaceCreationCommands().length === 0 &&
    getWorkspaceCommands("pane", "context-menu").length === 0
  ) {
    return false;
  }
  const workspacePosition = getWorkspacePosition(clientPoint);
  publishWorkspaceMenuInvocation({
    kind: "pane",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context: createPaneCommandContext(workspacePosition),
    workspacePosition,
  });
  return true;
}

type WorkspaceSectionMenuInput = {
  sectionId: string;
  clientPoint: WorkspaceMenuClientPoint;
  owner: HTMLElement;
  surface: WorkspaceSectionMenuSurface;
  initialFocus: WorkspaceMenuInitialFocus;
};

function publishWorkspaceSectionMenu({
  sectionId,
  clientPoint,
  owner,
  surface,
  initialFocus,
}: WorkspaceSectionMenuInput): void {
  const selection = getSelectedSectionContext(sectionId);
  // Frozen main's header action belongs to the owning group even when that group is part of a
  // larger selection, so a header invocation targets its own section. Context menus keep acting
  // on the captured selection. The difference lives in the context, not in the command.
  const selectedSections = surface === "header" ? [selection.section] : selection.selectedSections;
  publishWorkspaceMenuInvocation({
    kind: "section",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context: createSectionCommandContext(selection.section, selectedSections),
    initialFocus,
    surface,
  });
}

export function openWorkspaceSectionMenu(
  sectionId: string,
  surface: "context-menu" | "outline",
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): void {
  publishWorkspaceSectionMenu({
    sectionId,
    clientPoint,
    owner,
    surface,
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
  openWorkspaceSectionMenu(sectionId, "context-menu", clientPoint, owner);
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
  publishWorkspaceMenuInvocation({
    kind: "item",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context: createItemCommandContext(section, getItemOrThrow(itemTree, itemId)),
  });
  return true;
}
