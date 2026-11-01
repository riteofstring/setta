import { getReactFlowStore } from "../canvas/store.js";
import { getIsZoomRuntimeReady, setCenter } from "../canvas/viewportHelpers.js";
import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes.js";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities.js";
import { insertWorkspaceSection } from "../document/insertWorkspaceSection.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { resolveWorkspaceEmptySpacePlacement } from "./emptySpacePlacement.js";

const CREATION_PAN_DURATION_MS = 200;

export function createWorkspaceSectionFromCommand(
  host: WorkspaceHost,
  command: WorkspaceCreationCommand,
): boolean {
  if (!getWorkspaceCapabilitiesStore(host).getState().canEditStructure) {
    return false;
  }
  const context = Object.freeze({ workspacePosition: null });
  if (command.isDisabled?.(context)) {
    return false;
  }
  const section = command.createSection(context);
  const placement = resolveWorkspaceEmptySpacePlacement(host, section);
  insertWorkspaceSection(host, section, placement.position);

  if (placement.panTo && getIsZoomRuntimeReady(host)) {
    setCenter(host, placement.panTo.x, placement.panTo.y, {
      zoom: getReactFlowStore(host).getState().transform[2],
      duration: CREATION_PAN_DURATION_MS,
    });
  }
  return true;
}
