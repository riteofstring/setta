import { useStoreActions } from "easy-peasy";
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
  const addSection = useStoreActions((x) => x.thunks.createDefaultSectionInfo);

  return (isDeck) => () => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const initialPosition = getPosition(x, y);
    const sectionProps = { isTopLevel: true, initialPosition };
    const configProps = {};
    if (isDeck) {
      sectionProps.name = "Deck";
      configProps.uiTypeId = DECK_UI_TYPE_ID;
    }
    const [newId] = addSection({ sectionProps, configProps });
    if (afterAddSection) {
      afterAddSection(newId);
    }
    closeContextMenu();
  };
}
