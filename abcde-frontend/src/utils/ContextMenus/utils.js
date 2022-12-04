import { useStoreActions } from "easy-peasy";
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

  const addAtPosition = useStoreActions((x) => x.thunks.addSectionAtPosition);
  const getPosition = useMouseToReactFlowPosition(reactFlowRef);

  return (isDeck) => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const initialPosition = getPosition(x, y);
    addAtPosition({ isDeck, initialPosition, fnAfterAddSection });
  };
}
