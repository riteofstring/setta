import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { guiToYaml } from "state/actions/guiToYaml";
import { resetSectionToDefaultVersion } from "state/actions/sectionVariants";
import { getSectionInfo } from "state/getters/sectionInfo";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function ResetToDefaultVersion({ sectionId }) {
  function onClick() {
    const { displayMode } = getSectionInfo(sectionId);
    resetSectionToDefaultVersion(sectionId);
    if (displayMode === SECTION_DISPLAY_MODES.YAML) {
      guiToYaml(sectionId);
    }
  }

  return <MenuItem onClick={onClick}>Reset To Default Version</MenuItem>;
}
