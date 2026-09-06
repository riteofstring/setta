import { getNodeInternalsStore } from "../document/stores";
import type { Node } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";

export function getNodes(host: WorkspaceHost): Array<Node> {
  return Array.from(getNodeInternalsStore(host).getState().x.values());
}
