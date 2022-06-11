import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import { useMouseToReactFlowPosition } from "hooks/useMouseToReactFlowPosition";
import { DEFAULT_DECK_UI_TYPE_ID } from "utils/constants";

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
      sectionProps.uiTypeId = DEFAULT_DECK_UI_TYPE_ID;
      sectionProps.isDeck = true;
    }
    const [newId] = addSection(sectionProps);
    if (afterAddSection) {
      afterAddSection(newId);
    }
    closeContextMenu();
  };
}
