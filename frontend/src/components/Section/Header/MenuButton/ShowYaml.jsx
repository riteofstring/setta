import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function ShowYaml({ sectionId }) {
  const displayMode = useSectionInfos((x) => x.x[sectionId].displayMode);

  function onClick() {
    setSectionInfoAttr({
      sectionId,
      attr: "displayMode",
      value:
        displayMode === SECTION_DISPLAY_MODES.YAML
          ? SECTION_DISPLAY_MODES.GUI
          : SECTION_DISPLAY_MODES.YAML,
    });
  }

  return (
    <MenuItem onClick={onClick}>
      {displayMode === SECTION_DISPLAY_MODES.YAML ? "Show GUI" : "Show Yaml"}
    </MenuItem>
  );
}
