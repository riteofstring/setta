import { onClickAddSection } from "hooks/useCreateSectionOrDeck";
import { useEffect, useState } from "react";
import { Item } from "utils/atoms/dropdown/item";
import {
  CODE,
  DECK,
  GLOBAL_VARIABLES,
  SCRIPT,
  SECTION,
  VAR_CONTROL,
} from "z_utils/constants";
import { ContextMenuCore } from "./ContextMenuCore";
import { PaneContextMenuModal } from "./PaneContextMenuModal";

export function PaneContextMenu({ x, y, closeContextMenu, isOpen }) {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (isOpen) {
      setCoords({ x, y });
    }
  }, [isOpen]);

  const commonProps = {
    ...coords,
    callbackBeforeExit: closeContextMenu,
    projectXY: true,
    incrementVersion: true,
  };

  const [open, setOpen] = useState(false);
  const [modalType, setModalType] = useState("");
  async function openLoadModal(_modalType) {
    setModalType(_modalType);
    setOpen(true);
  }

  return (
    <PaneContextMenuModal
      modalType={modalType}
      open={open}
      setOpen={setOpen}
      commonProps={commonProps}
    >
      <ContextMenuCore
        x={x}
        y={y}
        closeContextMenu={closeContextMenu}
        isOpen={isOpen}
      >
        <Item
          onClick={() => onClickAddSection({ type: SECTION, ...commonProps })}
        >
          New Section
        </Item>
        <Item onClick={() => onClickAddSection({ type: DECK, ...commonProps })}>
          New Group
        </Item>
        <Item
          onClick={() =>
            onClickAddSection({ type: GLOBAL_VARIABLES, ...commonProps })
          }
        >
          New Global Variables
        </Item>
        <Item
          onClick={() => onClickAddSection({ type: SCRIPT, ...commonProps })}
        >
          New Script
        </Item>
        <Item onClick={() => onClickAddSection({ type: CODE, ...commonProps })}>
          New Code
        </Item>
        <Item
          onClick={() =>
            onClickAddSection({ type: VAR_CONTROL, ...commonProps })
          }
        >
          New Variable Control
        </Item>
        <Item onClick={() => openLoadModal("Create From Argparse")}>
          Create From Argparse
        </Item>
        <Item onClick={() => openLoadModal("Load Section")}>Load Section</Item>
      </ContextMenuCore>
    </PaneContextMenuModal>
  );
}
