import { useKeyPress } from "react-flow-renderer";

export function useDragActivation() {
  const isSorting = useKeyPress("Control");
  const isMovingFree = useKeyPress("Alt");
  return { isSorting, isMovingFree };
}
