import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { guiToYaml } from "state/actions/guiToYaml";
import {
  getSectionInfo,
  resetSectionsToDefaultVersions,
} from "state/actions/sectionInfos";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function ResetToDefaultVersion({ sectionId }) {
  function onClick() {
    const { displayMode } = getSectionInfo(sectionId);
    resetSectionsToDefaultVersions([sectionId]);
    if (displayMode === SECTION_DISPLAY_MODES.YAML) {
      guiToYaml(sectionId);
    }
  }

  return <MenuItem onClick={onClick}>Reset To Default Version</MenuItem>;
}
