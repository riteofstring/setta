import { useReactFlow } from "reactflow";

export function useMouseToReactFlowPosition(reactFlowRef) {
  const { project } = useReactFlow();
  return (x: number, y: number) => {
    const reactFlowBounds = reactFlowRef.current.getBoundingClientRect();
    return project({
      x: x - reactFlowBounds.left,
      y: y - reactFlowBounds.top,
    });
  };
}
