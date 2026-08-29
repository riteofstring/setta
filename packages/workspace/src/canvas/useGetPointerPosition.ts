import { useCallback } from "react";
import { useWorkspaceHost } from "../workspaceHostContext";
import { getReactFlowStore } from "./store";
import type { UseDragEvent } from "./types";

function useGetPointerPosition() {
  const host = useWorkspaceHost();
  // returns the pointer position projected to the canvas coordinate system
  const getPointerPosition = useCallback(
    ({ sourceEvent }: UseDragEvent) => {
      const { transform } = getReactFlowStore(host).getState();
      const x = sourceEvent.touches
        ? sourceEvent.touches[0].clientX
        : sourceEvent.clientX;
      const y = sourceEvent.touches
        ? sourceEvent.touches[0].clientY
        : sourceEvent.clientY;

      const pointerPos = {
        x: (x - transform[0]) / transform[2],
        y: (y - transform[1]) / transform[2],
      };

      return {
        xSnapped: pointerPos.x,
        ySnapped: pointerPos.y,
        ...pointerPos,
      };
    },
    [host],
  );

  return getPointerPosition;
}

export default useGetPointerPosition;
