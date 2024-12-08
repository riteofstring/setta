import { Item } from "components/Utils/atoms/dropdown/item";
import C from "constants/constants.json";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { addSectionAtPosition } from "state/actions/sections/createSections";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useContextMenus, useSectionInfos } from "state/definitions";
import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu() {
  const { isOpen, x, y } = useContextMenus((x) => x.pane, _.isEqual);
  const singletonSections = useSectionInfos(
    (x) => x.singletonSections,
    _.isEqual,
  );

  function getOnClickFn(specificProps) {
    return () => {
      useSectionInfos.setState((state) => {
        addSectionAtPosition({
          position: screenToFlowPosition({ x, y }),
          state,
          ...specificProps,
        });
      });
      maybeIncrementProjectStateVersion(true);
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
      {!singletonSections[C.GLOBAL_VARIABLES] && (
        <Item onClick={getOnClickFn({ type: C.GLOBAL_VARIABLES })}>
          New Global Variables
        </Item>
      )}
      <Item
        onClick={getOnClickFn({
          type: C.CODE,
          sectionProps: { codeLanguage: "python" },
        })}
      >
        New Python Script
      </Item>
      <Item
        onClick={getOnClickFn({
          type: C.INTERACTIVE_CODE,
          sectionProps: { codeLanguage: "python" },
        })}
      >
        New Interactive Python Script
      </Item>
      <Item
        onClick={getOnClickFn({
          type: C.CODE,
          sectionProps: { codeLanguage: "bash" },
        })}
      >
        New Bash Script
      </Item>
      <Item onClick={getOnClickFn({ type: C.TERMINAL })}>New Terminal</Item>
      {!singletonSections[C.GLOBAL_PARAM_SWEEP] && (
        <Item onClick={getOnClickFn({ type: C.GLOBAL_PARAM_SWEEP })}>
          New Global Param Sweep
        </Item>
      )}
      <Item onClick={getOnClickFn({ type: C.DRAW })}>New Drawing Area</Item>
      <Item onClick={getOnClickFn({ type: C.SOCIAL })}>New Social</Item>
      <Item onClick={getOnClickFn({ type: C.IFRAME })}>New IFrame</Item>
    </ContextMenuCore>
  );
}
