import type { Position } from "../document/types.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { resolveScreenToFlowPosition } from "./flowPosition.js";
import { getWorkspaceOptionsStore } from "./options.js";
import { getReactFlowStore } from "./store.js";

export function screenToFlowPosition(
  host: WorkspaceHost,
  position: Position,
  ignoreGrid = false,
): Position {
  return resolveScreenToFlowPosition(
    position,
    getReactFlowStore(host).getState(),
    getWorkspaceOptionsStore(host).getState(),
    ignoreGrid,
  );
}
