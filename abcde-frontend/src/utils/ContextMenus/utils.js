import { useAddSectionAtPosition } from "hooks/useAddSectionAtPosition";
import { useMouseToReactFlowPosition } from "hooks/useMouseToReactFlowPosition";

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

  const addAtPosition = useAddSectionAtPosition({
    fnAfterAddSection,
  });
  const getPosition = useMouseToReactFlowPosition(reactFlowRef);

  return (isDeck) => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const initialPosition = getPosition(x, y);
    addAtPosition({ isDeck, initialPosition });
  };
}
