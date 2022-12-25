import { useReactFlow } from "react-flow-renderer";

export function useMouseToReactFlowPosition(reactFlowRef) {
  const { project } = useReactFlow();
  return (x, y) => {
    const reactFlowBounds = reactFlowRef.current.getBoundingClientRect();
    return project({
      x: x - reactFlowBounds.left,
      y: y - reactFlowBounds.top,
    });
  };
}
