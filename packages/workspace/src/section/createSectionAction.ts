import { getReactFlowStore } from "../canvas/store";
import { getIsZoomRuntimeReady, setCenter } from "../canvas/viewportHelpers";
import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { insertWorkspaceSection } from "../document/insertWorkspaceSection";
import type { WorkspaceHost } from "../workspaceHost";
import { resolveWorkspaceEmptySpacePlacement } from "./emptySpacePlacement";

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
