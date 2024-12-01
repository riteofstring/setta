import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { useSectionInfos } from "state/definitions";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function ShowYaml({ sectionId }) {
  const displayMode = useSectionInfos((x) => x.x[sectionId].displayMode);

  function onClick() {
    useSectionInfos.setState((state) => {
      state.x[sectionId].displayMode =
        displayMode === SECTION_DISPLAY_MODES.YAML
          ? SECTION_DISPLAY_MODES.GUI
          : SECTION_DISPLAY_MODES.YAML;
    });
  }

  return (
    <MenuItem onClick={onClick}>
      {displayMode === SECTION_DISPLAY_MODES.YAML ? "Show GUI" : "Show Yaml"}
    </MenuItem>
  );
}
