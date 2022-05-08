import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import { Menu, Item } from "react-contexify";

// https://reactflow.dev/examples/drag-and-drop/
export function NewSectionMenu({ divRef, reactFlowInstance }) {
  const addSection = useCreateDefaultSectionInfo();
  function newSectionClick({ triggerEvent: event }) {
    const bounds = divRef.current.getBoundingClientRect();
    const initialPosition = reactFlowInstance.project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    addSection({ isTopLevel: true, initialPosition });
  }
  return (
    <Menu id={"NewSectionMenu"}>
      <Item onClick={newSectionClick}>New Section</Item>
    </Menu>
  );
}
