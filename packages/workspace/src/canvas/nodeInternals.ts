import { getNodeInternalsStore } from "../document/stores.js";
import type { Node } from "../document/types.js";
import type { WorkspaceHost } from "../workspaceHost.js";

export function getNodes(host: WorkspaceHost): Array<Node> {
  return Array.from(getNodeInternalsStore(host).getState().x.values());
}
