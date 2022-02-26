import { Menu, Item } from "react-contexify";

export function NewSectionMenu() {
  // const addSection = useCreateDefaultSectionInfo();
  function newSectionClick({ triggerEvent }) {
    const { clientX: x, clientY: y } = triggerEvent;
    console.log("x,y", x, y);
    //   const newIds = addSection();
  }
  return (
    <Menu id={"NewSectionMenu"}>
      <Item onClick={newSectionClick}>New Section</Item>
    </Menu>
  );
}
