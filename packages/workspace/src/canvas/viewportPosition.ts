import type { Position } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import { resolveScreenToFlowPosition } from "./flowPosition";
import { getWorkspaceOptionsStore } from "./options";
import { getReactFlowStore } from "./store";

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
