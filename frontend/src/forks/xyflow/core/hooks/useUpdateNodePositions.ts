import { getNodes, updateNodePositions } from "state/actions/nodeInternals";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useLocalStorage, useSettings } from "state/stores/uiPreferenceStores";
import { useReactFlow } from "../store";

export const updatePositions = (params: {
  x: number;
  y: number;
  isShiftPressed: boolean;
}) => {
  const { nodesSelectionDims, shiftNodesSelection } = useReactFlow.getState();
  const { snapGrid } = useSettings.getState().gui;
  const snapToGrid = useLocalStorage.getState().snapToGrid;
  const activeSectionIds = getActiveSectionUIIds();
  const selectedNodes = getNodes().filter((n) =>
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
    if (n.position) {
      const nextPosition = {
        x: n.position.x + positionDiffX,
        y: n.position.y + positionDiffY,
      };

      if (snapToGrid) {
        nextPosition.x = snapGrid[0] * Math.round(nextPosition.x / snapGrid[0]);
        nextPosition.y = snapGrid[1] * Math.round(nextPosition.y / snapGrid[1]);
      }

      n.position = nextPosition;
    }

    return n;
  });

  updateNodePositions(nodeUpdates);
  if (nodesSelectionDims) {
    shiftNodesSelection({ x: positionDiffX, y: positionDiffY });
  }
};
