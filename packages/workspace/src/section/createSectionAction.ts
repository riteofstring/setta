import { useReactFlow } from "../canvas/store";
import { getIsZoomRuntimeReady, setCenter } from "../canvas/viewportHelpers";
import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { insertWorkspaceSection } from "../document/insertWorkspaceSection";
import { resolveWorkspaceEmptySpacePlacement } from "./emptySpacePlacement";

// The reference times this one travel itself rather than through its transition-duration setting,
// which its fit-view, go-to-section, and zoom-to-pointer travel do use.
const CREATION_PAN_DURATION_MS = 200;

// The canonical creation operation for a request that carries no pointer. The pane menu creates
// where the pointer asked; a chord has nowhere to point, so the package resolves the place and
// then tells the command where its section will land — the reference's own order, where the
// creation request carries a null position and the answer comes back with the resolved layout.
//
// The reference then waits for its backend and retries until the created node appears
// (`ensureSectionOnTop`). Package insertion publishes the document, the node, and the active
// section in one atomic change, so the created section is already the single active, top-most
// section when this returns and there is nothing to wait for.
export function createWorkspaceSectionFromCommand(
  command: WorkspaceCreationCommand,
): boolean {
  if (!useWorkspaceCapabilities.getState().canEditStructure) {
    return false;
  }
  const context = Object.freeze({ workspacePosition: null });
  if (command.isDisabled?.(context)) {
    return false;
  }
  const section = command.createSection(context);
  const placement = resolveWorkspaceEmptySpacePlacement(section);
  insertWorkspaceSection(section, placement.position);
  // The reference's `centerViewportOnCreatedSection`: travel to the section at the zoom level the
  // canvas is already at, so creating something out of sight never rescales the workspace. A
  // canvas whose zoom pane has not initialized has nowhere to travel, exactly as keyboard focus
  // movement finds when it arrives that early.
  if (placement.panTo && getIsZoomRuntimeReady()) {
    setCenter(placement.panTo.x, placement.panTo.y, {
      zoom: useReactFlow.getState().transform[2],
      duration: CREATION_PAN_DURATION_MS,
    });
  }
  return true;
}
