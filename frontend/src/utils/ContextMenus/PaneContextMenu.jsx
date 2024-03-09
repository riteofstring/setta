import _ from "lodash";
import { useModal } from "models/modal";
import { useEffect, useState } from "react";
import { onClickAddSection } from "thunks/createSectionOrDeck";
import { DialogDropdownTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { Item } from "utils/atoms/dropdown/item";
import {
  CODE,
  DECK,
  GLOBAL_PARAM_SWEEP,
  GLOBAL_VARIABLES,
  SCRIPT,
  SECTION,
  TERMINAL,
  VAR_CONTROL,
} from "z_utils/constants";
import { ContextMenuCore } from "./ContextMenuCore";

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

  const setModalType = useModal((x) => x.setModalType);
  const setModalData = useModal((x) => x.setModalData);
  function openLoadModal(_modalType) {
    setModalType(_modalType);
    setModalData(_.omit(commonProps, ["callbackBeforeExit"]));
    closeContextMenu();
  }

  return (
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
      <Item onClick={() => onClickAddSection({ type: SCRIPT, ...commonProps })}>
        New Script
      </Item>
      <Item onClick={() => onClickAddSection({ type: CODE, ...commonProps })}>
        New Code
      </Item>
      <Item
        onClick={() => onClickAddSection({ type: VAR_CONTROL, ...commonProps })}
      >
        New Variable Control
      </Item>
      <Item
        onClick={() => onClickAddSection({ type: TERMINAL, ...commonProps })}
      >
        New Terminal
      </Item>
      <Item
        onClick={() =>
          onClickAddSection({ type: GLOBAL_PARAM_SWEEP, ...commonProps })
        }
      >
        New Global Param Sweep
      </Item>
      <DialogDropdownTriggerItem
        onClick={() => openLoadModal("Create From Argparse")}
      >
        Create From Argparse
      </DialogDropdownTriggerItem>
      <DialogDropdownTriggerItem onClick={() => openLoadModal("Load Section")}>
        Load Section
      </DialogDropdownTriggerItem>
    </ContextMenuCore>
  );
}
