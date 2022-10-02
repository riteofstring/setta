import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import { useMouseToReactFlowPosition } from "hooks/useMouseToReactFlowPosition";
import { DECK_UI_TYPE_ID } from "utils/constants";

export function useOnClickAddSection({
  x,
  y,
  closeContextMenu,
  reactFlowRef,
  afterAddSection,
}) {
  const getPosition = useMouseToReactFlowPosition(reactFlowRef);
  const addSection = useCreateDefaultSectionInfo();

  return (isDeck) => () => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const initialPosition = getPosition(x, y);
    const sectionProps = { isTopLevel: true, initialPosition };
    if (isDeck) {
      sectionProps.name = "Deck";
      sectionProps.uiTypeId = DECK_UI_TYPE_ID;
    }
    const [newId] = addSection(sectionProps);
    if (afterAddSection) {
      afterAddSection(newId);
    }
    closeContextMenu();
  };
}
