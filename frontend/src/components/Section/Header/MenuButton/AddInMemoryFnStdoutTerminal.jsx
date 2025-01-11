import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import C from "constants/constants.json";
import { addSectionInEmptySpace } from "state/actions/sections/createSections";
import { useSectionInfos } from "state/definitions";

export function AddInMemoryFnStdoutTerminal({}) {
  function onClick(e) {
    const existingTerminalId =
      useSectionInfos.getState().singletonSections.inMemoryFnStdoutTerminal;

    if (existingTerminalId) {
      goToSection(existingTerminalId);
      e.stopPropagation();
    } else {
      addSectionInEmptySpace({
        type: C.TERMINAL,
        sectionProps: { isReadOnlyTerminal: true },
      });
    }
  }

  return <MenuItem onClick={onClick}>Add Stdout Terminal</MenuItem>;
}
