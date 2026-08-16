import { getActiveSectionIds } from "../document/activeSections";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import type { WorkspaceHost } from "../workspaceHost";
import { getNodes, updateNodePositions } from "./nodeInternalsActions";
import { getWorkspaceOptionsStore } from "./options";
import { getReactFlowStore } from "./store";

export const updatePositions = (host: WorkspaceHost, params: {
  x: number;
  y: number;
  isShiftPressed: boolean;
}) => {
  if (!getWorkspaceCapabilitiesStore(host).getState().canEditLayout) {
    return;
  }
  const { nodesSelectionDims, shiftNodesSelection } = getReactFlowStore(host).getState();
  const { snapGrid, snapToGrid } = getWorkspaceOptionsStore(host).getState();
  const activeSectionIds = getActiveSectionIds(host);
  const selectedNodes = getNodes(host).filter((n) =>
    activeSectionIds.includes(n.id),
  );
  // by default a node moves 5px on each key press, or 20px if shift is pressed
  // if snap grid is enabled, we use that for the velocity.
  const xVelo = snapToGrid ? snapGrid[0] : 5;
  const yVelo = snapToGrid ? snapGrid[1] : 5;
  const factor = params.isShiftPressed ? 4 : 1;

  const positionDiffX = params.x * xVelo * factor;
  const positionDiffY = params.y * yVelo * factor;

  const nodeUpdates = selectedNodes.map((n) => {
    const nextPosition = {
      x: n.position.x + positionDiffX,
      y: n.position.y + positionDiffY,
    };

    if (snapToGrid) {
      nextPosition.x = snapGrid[0] * Math.round(nextPosition.x / snapGrid[0]);
      nextPosition.y = snapGrid[1] * Math.round(nextPosition.y / snapGrid[1]);
    }

    return {
      id: n.id,
      position: nextPosition,
      distance: { x: 0, y: 0 },
      width: n.width,
      height: n.height,
    };
  });

  updateNodePositions(host, nodeUpdates);
  if (nodesSelectionDims) {
    shiftNodesSelection({ x: positionDiffX, y: positionDiffY });
  }
};
