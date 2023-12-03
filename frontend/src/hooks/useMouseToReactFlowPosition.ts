import { useReactFlow } from "reactflow";

export function useMouseToReactFlowPosition() {
  const { screenToFlowPosition } = useReactFlow();
  return (x: number, y: number) => {
    return screenToFlowPosition({ x, y });
  };
}
