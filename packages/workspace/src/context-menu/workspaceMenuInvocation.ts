import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { getReactFlowStore } from "../canvas/store";
import {
  createItemCommandContext,
  createPaneCommandContext,
  createSectionCommandContext,
} from "../commands/workspaceCommandContexts";
import { getWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { getActiveSectionIds } from "../document/activeSections";
import { getSectionOrThrow } from "../document/documentSelectors";
import { getItemOrThrow } from "../document/itemTree";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { Position, WorkspaceSection } from "../document/types";
import { getElementTextDirection } from "../styles/textDirection";
import type { WorkspaceHost } from "../workspaceHost";
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

function getWorkspacePosition(
  host: WorkspaceHost,
  clientPoint: WorkspaceMenuClientPoint,
): Position {
  const { domNode, transform } = getReactFlowStore(host).getState();
  if (!domNode) {
    throw new Error(
      "Workspace pane menu cannot open before the canvas DOM is initialized.",
    );
  }
  return clientPointToWorkspacePosition(
    clientPoint,
    domNode.getBoundingClientRect(),
    {
      x: transform[0],
      y: transform[1],
      zoom: transform[2],
    },
  );
}

function getSelectedSectionContext(host: WorkspaceHost, sectionId: string): {
  section: WorkspaceSection;
  selectedSections: Array<WorkspaceSection>;
} {
  const before = getActiveSectionIds(host);
  if (!before.includes(sectionId)) {
    applyActiveSectionChange(host, {
      interaction: "section-click",
      sectionId,
      multiSelectionActive: false,
    });
  }
  const state = getWorkspaceDocumentStore(host).getState();
  return {
    section: getSectionOrThrow(state, sectionId),
    selectedSections: getActiveSectionIds(host).map((id) =>
      getSectionOrThrow(state, id),
    ),
  };
}

export function openWorkspacePaneMenu(
  host: WorkspaceHost,
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): boolean {
  if (
    getWorkspaceCreationCommands(host).length === 0 &&
    getWorkspaceCommands(host, "pane", "context-menu").length === 0
  ) {
    return false;
  }
  const workspacePosition = getWorkspacePosition(host, clientPoint);
  publishWorkspaceMenuInvocation(host, {
    kind: "pane",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context: createPaneCommandContext(host, workspacePosition),
    workspacePosition,
  });
  return true;
}

type WorkspaceSectionMenuInput = {
  host: WorkspaceHost;
  sectionId: string;
  clientPoint: WorkspaceMenuClientPoint;
  owner: HTMLElement;
  surface: WorkspaceSectionMenuSurface;
  initialFocus: WorkspaceMenuInitialFocus;
};

function publishWorkspaceSectionMenu({
  host,
  sectionId,
  clientPoint,
  owner,
  surface,
  initialFocus,
}: WorkspaceSectionMenuInput): void {
  const selection = getSelectedSectionContext(host, sectionId);
  // Frozen main's header action belongs to the owning group even when that group is part of a
  // larger selection, so a header invocation targets its own section. Context menus keep acting
  // on the captured selection. The difference lives in the context, not in the command.
  const selectedSections =
    surface === "header" ? [selection.section] : selection.selectedSections;
  publishWorkspaceMenuInvocation(host, {
    kind: "section",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context: createSectionCommandContext(
      host,
      selection.section,
      selectedSections,
    ),
    initialFocus,
    surface,
  });
}

export function openWorkspaceSectionMenu(
  host: WorkspaceHost,
  sectionId: string,
  surface: "context-menu" | "outline",
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): void {
  publishWorkspaceSectionMenu({
    host,
    sectionId,
    clientPoint,
    owner,
    surface,
    initialFocus: "first",
  });
}

export function openWorkspaceSectionHeaderMenu(
  host: WorkspaceHost,
  sectionId: string,
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
  initialFocus: WorkspaceMenuInitialFocus = "first",
): void {
  publishWorkspaceSectionMenu({
    host,
    sectionId,
    clientPoint,
    owner,
    surface: "header",
    initialFocus,
  });
}

export function openWorkspaceSelectionMenu(
  host: WorkspaceHost,
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): void {
  const sectionId = getActiveSectionIds(host).at(-1);
  if (!sectionId) {
    throw new Error(
      "Workspace selection menu requires at least one selected section.",
    );
  }
  openWorkspaceSectionMenu(host, sectionId, "context-menu", clientPoint, owner);
}

export function openWorkspaceItemMenu(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
  clientPoint: WorkspaceMenuClientPoint,
  owner: HTMLElement,
): boolean {
  const state = getWorkspaceDocumentStore(host).getState();
  const section = getSectionOrThrow(state, sectionId);
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(
      `Workspace item menu section ${sectionId} has no item tree.`,
    );
  }
  publishWorkspaceMenuInvocation(host, {
    kind: "item",
    clientPoint,
    direction: getElementTextDirection(owner),
    owner,
    context: createItemCommandContext(
      host,
      section,
      getItemOrThrow(itemTree, itemId),
    ),
  });
  return true;
}
