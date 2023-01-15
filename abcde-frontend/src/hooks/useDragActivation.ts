import { useKeyPress } from "reactflow";

export function useDragActivation() {
  const isSorting = useKeyPress("Control");
  const isMovingFree = useKeyPress("Alt");
  return { isSorting, isMovingFree };
}
