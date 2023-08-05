import { dbGetSections } from "dbRequests/sections";
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
    setSections(await dbGetSections());
    setOpen(true);
  }

  return (
    <SaveLoadModal
      modalType={"Load"}
      files={sections}
      title={"Load Section"}
      buttonText={"Load"}
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
