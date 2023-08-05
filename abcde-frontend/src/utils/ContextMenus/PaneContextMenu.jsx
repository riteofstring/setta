import { dbGetSectionList } from "dbRequests/sections";
import { useOnClickAddSection } from "hooks/useCreateSectionOrDeck";
import { useState } from "react";
import { Item } from "utils/atoms/dropdown/item";
import { SaveLoadModal } from "utils/FileExplorer/SaveLoadModal";
import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu({ x, y, closeContextMenu, ...props }) {
  const onClick = useOnClickAddSection();
  const commonProps = {
    x,
    y,
    callbackBeforeExit: closeContextMenu,
    projectXY: true,
    incrementVersion: true,
  };

  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState([]);
  async function openLoadModal() {
    setSections(await dbGetSectionList());
    setOpen(true);
  }

  function loadSection() {
    console.log("load")
  }

  return (
    <SaveLoadModal
      modalType={"Load"}
      folders={sections}
      title={"Load Section"}
      buttonText={"Load"}
      onClickActionButton={loadSection}
      open={open}
      setOpen={setOpen}
    >
      <ContextMenuCore
        x={x}
        y={y}
        closeContextMenu={closeContextMenu}
        {...props}
      >
        <Item onClick={() => onClick({ isDeck: false, ...commonProps })}>
          New Section
        </Item>
        <Item onClick={() => onClick({ isDeck: true, ...commonProps })}>
          New Group
        </Item>
        <Item onClick={openLoadModal}>Load Section</Item>
      </ContextMenuCore>
    </SaveLoadModal>
  );
}
