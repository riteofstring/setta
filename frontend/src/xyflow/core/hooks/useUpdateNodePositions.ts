import { useCallback } from "react";

import { useNodeInternals } from "models/info/nodeInternals";
import { useSettings } from "models/settings";
import { useReactFlow } from "../store";

function useUpdateNodePositions() {
  const updatePositions = useCallback(
    (params: { x: number; y: number; isShiftPressed: boolean }) => {
      const { updateNodePositions, nodesDraggable } = useReactFlow.getState();
      const { snapToGrid, snapGrid } = useSettings.getState();
      const selectedNodes = useNodeInternals
        .getState()
        .getNodes()
        .filter(
          (n) =>
            n.selected &&
            (n.draggable ||
              (nodesDraggable && typeof n.draggable === "undefined")),
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
            nextPosition.x =
              snapGrid[0] * Math.round(nextPosition.x / snapGrid[0]);
            nextPosition.y =
              snapGrid[1] * Math.round(nextPosition.y / snapGrid[1]);
          }

          n.position = nextPosition;
        }

        return n;
      });

      updateNodePositions(nodeUpdates, true, false);
    },
    [],
  );

  return updatePositions;
}

export default useUpdateNodePositions;
