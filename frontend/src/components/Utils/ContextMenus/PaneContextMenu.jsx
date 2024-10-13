import { Item } from "components/Utils/atoms/dropdown/item";
import C from "constants/constants.json";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { setModalData, setModalType } from "state/actions/modal";
import { onClickAddSection } from "state/actions/sections/createSections";
import { useContextMenus } from "state/definitions";
import { SINGLETON_SECTIONS } from "utils/constants";
import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu() {
  const { isOpen, x, y } = useContextMenus((x) => x.pane, _.isEqual);

  const commonProps = {
    x,
    y,
    projectXY: true,
    incrementVersion: true,
  };

  function openLoadModal(_modalType) {
    setModalType(_modalType);
    setModalData(commonProps);
    closeAllContextMenus();
  }

  function getOnClickFn(specificProps) {
    return () => {
      onClickAddSection({ ...commonProps, ...specificProps });
      closeAllContextMenus();
    };
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeAllContextMenus}
      isOpen={isOpen}
    >
      <Item onClick={getOnClickFn({ type: C.SECTION })}>New Section</Item>
      <Item onClick={getOnClickFn({ type: C.LIST_ROOT })}>New List</Item>
      <Item onClick={getOnClickFn({ type: C.DICT_ROOT })}>New Dict</Item>
      <Item onClick={getOnClickFn({ type: C.DECK })}>New Group</Item>
      <Item onClick={getOnClickFn({ type: C.INFO })}>New Info</Item>
      {!SINGLETON_SECTIONS.globalVariables && (
        <Item onClick={getOnClickFn({ type: C.GLOBAL_VARIABLES })}>
          New Global Variables
        </Item>
      )}
      <Item
        onClick={getOnClickFn({
          type: C.CODE,
          inputSectionProps: { codeLanguage: "python" },
        })}
      >
        New Python Script
      </Item>
      <Item
        onClick={getOnClickFn({
          type: C.INTERACTIVE_CODE,
          inputSectionProps: { codeLanguage: "python" },
        })}
      >
        New Interactive Python Script
      </Item>
      <Item
        onClick={getOnClickFn({
          type: C.CODE,
          inputSectionProps: { codeLanguage: "bash" },
        })}
      >
        New Bash Script
      </Item>
      <Item onClick={getOnClickFn({ type: C.TERMINAL })}>New Terminal</Item>
      {!SINGLETON_SECTIONS.globalParamSweep && (
        <Item onClick={getOnClickFn({ type: C.GLOBAL_PARAM_SWEEP })}>
          New Global Param Sweep
        </Item>
      )}
      <Item onClick={getOnClickFn({ type: C.DRAW })}>New Drawing Area</Item>
      <Item onClick={getOnClickFn({ type: C.SOCIAL })}>New Social</Item>
    </ContextMenuCore>
  );
}
