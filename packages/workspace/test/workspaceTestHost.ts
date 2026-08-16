import { createElement, type ReactNode } from "react";
import { getWorkspaceOptionsStore } from "../src/canvas/options";
import { getReactFlowStore } from "../src/canvas/store";
import { getWorkspaceMenuStateStore } from "../src/context-menu/workspaceMenuState";
import { getWorkspaceCapabilitiesStore } from "../src/document/capabilities";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceAppearanceStore,
  getWorkspaceDocumentStore,
} from "../src/document/stores";
import { getItemSelectionModeStore } from "../src/document/itemSelectionMode";
import { getDndChildrenStore } from "../src/dnd/dndChildren";
import { getDndStateStore } from "../src/dnd/dndState";
import { getItemDndChildrenStore } from "../src/dnd/itemDndChildren";
import { getItemDndStateStore } from "../src/dnd/itemDndState";
import { getResizeEventStore } from "../src/section/resize/resizeEvents";
import { getSectionRefsStore } from "../src/section/sectionRefs";
import {
  createWorkspaceHost,
  type WorkspaceHost,
} from "../src/workspaceHost";
import { WorkspaceProvider } from "../src/workspaceHostContext";
import { getWorkspaceHostDomId } from "../src/workspaceHostInternals";
import { getWorkspaceTooltipStore } from "../src/tooltip/WorkspaceTooltip";

// Test code gets the same explicit host boundary as consumers. The convenience fields are only
// aliases for host-bound vanilla stores; they never resolve a default or current workspace.
export type WorkspaceTestHost = {
  domId: string;
  host: WorkspaceHost;
  activeSections: ReturnType<typeof getActiveSectionsStore>;
  appearance: ReturnType<typeof getWorkspaceAppearanceStore>;
  capabilities: ReturnType<typeof getWorkspaceCapabilitiesStore>;
  dndChildren: ReturnType<typeof getDndChildrenStore>;
  dndState: ReturnType<typeof getDndStateStore>;
  document: ReturnType<typeof getWorkspaceDocumentStore>;
  itemDndChildren: ReturnType<typeof getItemDndChildrenStore>;
  itemDndState: ReturnType<typeof getItemDndStateStore>;
  itemSelectionMode: ReturnType<typeof getItemSelectionModeStore>;
  menuState: ReturnType<typeof getWorkspaceMenuStateStore>;
  nodeInternals: ReturnType<typeof getNodeInternalsStore>;
  options: ReturnType<typeof getWorkspaceOptionsStore>;
  reactFlow: ReturnType<typeof getReactFlowStore>;
  resizeEvent: ReturnType<typeof getResizeEventStore>;
  sectionRefs: ReturnType<typeof getSectionRefsStore>;
  tooltip: ReturnType<typeof getWorkspaceTooltipStore>;
};

export function createWorkspaceTestHost(): WorkspaceTestHost {
  const host = createWorkspaceHost();
  return {
    domId: getWorkspaceHostDomId(host),
    host,
    activeSections: getActiveSectionsStore(host),
    appearance: getWorkspaceAppearanceStore(host),
    capabilities: getWorkspaceCapabilitiesStore(host),
    dndChildren: getDndChildrenStore(host),
    dndState: getDndStateStore(host),
    document: getWorkspaceDocumentStore(host),
    itemDndChildren: getItemDndChildrenStore(host),
    itemDndState: getItemDndStateStore(host),
    itemSelectionMode: getItemSelectionModeStore(host),
    menuState: getWorkspaceMenuStateStore(host),
    nodeInternals: getNodeInternalsStore(host),
    options: getWorkspaceOptionsStore(host),
    reactFlow: getReactFlowStore(host),
    resizeEvent: getResizeEventStore(host),
    sectionRefs: getSectionRefsStore(host),
    tooltip: getWorkspaceTooltipStore(host),
  };
}

export function WorkspaceTestProvider({
  children,
  workspace,
}: {
  children: ReactNode;
  workspace: WorkspaceTestHost;
}) {
  return createElement(WorkspaceProvider, { host: workspace.host }, children);
}
