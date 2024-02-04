import { MouseEvent } from "react";
import { StoreApi } from "zustand";
import type { Node, ReactFlowState } from "../../types";

export function getMouseHandler(
  id: string,
  getState: StoreApi<ReactFlowState>["getState"],
  handler?: (event: MouseEvent, node: Node) => void,
) {
  return handler === undefined
    ? handler
    : (event: MouseEvent) => {
        const node = getState().nodeInternals.get(id);

        if (node) {
          handler(event, { ...node });
        }
      };
}
