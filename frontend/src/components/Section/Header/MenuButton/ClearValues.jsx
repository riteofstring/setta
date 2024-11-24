import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { guiToYaml } from "state/actions/guiToYaml";
import { initEnteredValue } from "state/actions/sectionVariants";
import { getParamUIType } from "state/actions/uiTypes/uiTypeCols";
import { useSectionVariants } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function ClearValues({ sectionId }) {
  function onClick() {
    const { variantId, displayMode } = getSectionInfo(sectionId);

    useSectionVariants.setState((x) => {
      for (const k of Object.keys(x.x[variantId].values)) {
        x.x[variantId].values[k] = initEnteredValue(
          getParamUIType(sectionId, k),
        );
      }
    });

    if (displayMode === SECTION_DISPLAY_MODES.YAML) {
      guiToYaml(sectionId);
    }
  }

  return <MenuItem onClick={onClick}>Clear Values</MenuItem>;
}
