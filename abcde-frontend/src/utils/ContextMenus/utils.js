import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import { useReactFlow } from "react-flow-renderer";
import { DEFAULT_DECK_UI_TYPE_ID } from "utils/constants";

export function useOnClickAddSection({
  x,
  y,
  closeContextMenu,
  reactFlowRef,
  afterAddSection,
}) {
  const { project } = useReactFlow();
  const addSection = useCreateDefaultSectionInfo();

  return (isDeck) => () => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const reactFlowBounds = reactFlowRef.current.getBoundingClientRect();
    const initialPosition = project({
      x: x - reactFlowBounds.left,
      y: y - reactFlowBounds.top,
    });
    const sectionProps = { isTopLevel: true, initialPosition };
    if (isDeck) {
      sectionProps.uiTypeId = DEFAULT_DECK_UI_TYPE_ID;
    }
    const [newId] = addSection(sectionProps);
    if (afterAddSection) {
      afterAddSection(newId);
    }
    closeContextMenu();
  };
}
