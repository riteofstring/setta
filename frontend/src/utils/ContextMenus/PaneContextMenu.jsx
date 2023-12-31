import { dbGetSections, dbLoadSection } from "dbRequests/sections";
import {
  useLoadSectionIntoState,
  useOnClickAddSection,
} from "hooks/useCreateSectionOrDeck";
import { useEffect, useState } from "react";
import { Item } from "utils/atoms/dropdown/item";
import { SaveLoadModal } from "utils/SaveLoadModal/SaveLoadModal";
import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu({ x, y, closeContextMenu, isOpen }) {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (isOpen) {
      setCoords({ x, y });
    }
  }, [isOpen]);

  const onClickNewSection = useOnClickAddSection();
  const loadSectionIntoState = useLoadSectionIntoState();
  const commonProps = {
    ...coords,
    callbackBeforeExit: closeContextMenu,
    projectXY: true,
    incrementVersion: true,
  };

  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState([]);
  async function openLoadModal() {
    const res = await dbGetSections();
    if (res.status === 200) {
      setSections(res.data);
      setOpen(true);
    }
  }

  async function onClickLoadSection({ selected }) {
    const res = await dbLoadSection({ sectionId: selected });
    if (res.status === 200) {
      loadSectionIntoState({
        ...res.data,
        ...commonProps,
        topLevelIds: [selected],
      });
    }
  }

  return (
    <SaveLoadModal
      modalType={"Load"}
      files={sections}
      title={"Load Section"}
      buttonText={"Load"}
      onClickActionButton={onClickLoadSection}
      open={open}
      setOpen={setOpen}
    >
      <ContextMenuCore
        x={x}
        y={y}
        closeContextMenu={closeContextMenu}
        isOpen={isOpen}
      >
        <Item
          onClick={() => onClickNewSection({ isDeck: false, ...commonProps })}
        >
          New Section
        </Item>
        <Item
          onClick={() => onClickNewSection({ isDeck: true, ...commonProps })}
        >
          New Group
        </Item>
        <Item onClick={openLoadModal}>Load Section</Item>
      </ContextMenuCore>
    </SaveLoadModal>
  );
}
