import type { WorkspaceHost } from "../workspaceHost";
import { getWorkspaceHostDomId } from "../workspaceHostInternals";

export function getWorkspaceSectionResizableId(
  host: WorkspaceHost,
  sectionId: string,
): string {
  return `${getWorkspaceHostDomId(host)}-${sectionId}-CustomResizable`;
}
