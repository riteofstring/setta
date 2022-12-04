import { useMouseToReactFlowPosition } from "hooks/useMouseToReactFlowPosition";
import { addSectionAtPosition } from "thunks/addSectionAtPosition";

export function useOnClickAddSection({
  x,
  y,
  closeContextMenu,
  reactFlowRef,
  afterAddSection,
}) {
  function fnAfterAddSection(newId) {
    if (afterAddSection) {
      afterAddSection(newId);
    }
    closeContextMenu();
  }

  const getPosition = useMouseToReactFlowPosition(reactFlowRef);

  return (isDeck) => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const initialPosition = getPosition(x, y);
    addSectionAtPosition({ isDeck, initialPosition, fnAfterAddSection });
  };
}
