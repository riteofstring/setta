import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import { Menu, Item } from "react-contexify";

export function NewSectionMenu() {
  const addSection = useCreateDefaultSectionInfo({ isTopLevel: true });
  function newSectionClick({ triggerEvent }) {
    const { clientX: x, clientY: y } = triggerEvent;
    addSection();
  }
  return (
    <Menu id={"NewSectionMenu"}>
      <Item onClick={newSectionClick}>New Section</Item>
    </Menu>
  );
}
