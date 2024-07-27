import C from "constants/constants.json";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { onClickAddSection } from "state/actions/createSectionOrDeck";
import { setModalData, setModalType } from "state/actions/modal";
import { useContextMenus } from "state/definitions/contextMenus";
import { DialogDropdownTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { Item } from "utils/atoms/dropdown/item";
import { SINGLETON_SECTIONS } from "utils/constants";
import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu() {
  const { isOpen, x, y } = useContextMenus((x) => x.pane, _.isEqual);

  const commonProps = {
    x,
    y,
    callbackBeforeExit: closeAllContextMenus,
    projectXY: true,
    incrementVersion: true,
  };

  function openLoadModal(_modalType) {
    setModalType(_modalType);
    setModalData(_.omit(commonProps, ["callbackBeforeExit"]));
    closeAllContextMenus();
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeAllContextMenus}
      isOpen={isOpen}
    >
      <Item
        onClick={() => onClickAddSection({ type: C.SECTION, ...commonProps })}
      >
        New Section
      </Item>
      <Item
        onClick={() => onClickAddSection({ type: C.LIST_ROOT, ...commonProps })}
      >
        New List
      </Item>
      <Item
        onClick={() => onClickAddSection({ type: C.DICT_ROOT, ...commonProps })}
      >
        New Dict
      </Item>
      <Item onClick={() => onClickAddSection({ type: C.DECK, ...commonProps })}>
        New Group
      </Item>
      <Item onClick={() => onClickAddSection({ type: C.INFO, ...commonProps })}>
        New Info
      </Item>
      {!SINGLETON_SECTIONS.globalVariables && (
        <Item
          onClick={() =>
            onClickAddSection({ type: C.GLOBAL_VARIABLES, ...commonProps })
          }
        >
          New Global Variables
        </Item>
      )}
      <Item
        onClick={() =>
          onClickAddSection({
            type: C.CODE,
            ...commonProps,
            inputSectionProps: { codeLanguage: "python" },
          })
        }
      >
        New Python Script
      </Item>
      <Item
        onClick={() =>
          onClickAddSection({
            type: C.CODE,
            ...commonProps,
            inputSectionProps: { codeLanguage: "bash" },
          })
        }
      >
        New Bash Script
      </Item>
      {!SINGLETON_SECTIONS.varControl && (
        <Item
          onClick={() =>
            onClickAddSection({ type: C.VAR_CONTROL, ...commonProps })
          }
        >
          New Variable Control
        </Item>
      )}
      <Item
        onClick={() => onClickAddSection({ type: C.TERMINAL, ...commonProps })}
      >
        New Terminal
      </Item>
      {!SINGLETON_SECTIONS.globalParamSweep && (
        <Item
          onClick={() =>
            onClickAddSection({ type: C.GLOBAL_PARAM_SWEEP, ...commonProps })
          }
        >
          New Global Param Sweep
        </Item>
      )}
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
