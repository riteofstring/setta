import type { WorkspaceHost } from "../workspaceHost.js";
import { getWorkspaceHostDomId } from "../workspaceHostInternals.js";

export function getWorkspaceSectionResizableId(
  host: WorkspaceHost,
  sectionId: string,
): string {
  return `${getWorkspaceHostDomId(host)}-${sectionId}-CustomResizable`;
}
