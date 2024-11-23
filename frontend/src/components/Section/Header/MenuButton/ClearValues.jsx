import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { guiToYaml } from "state/actions/guiToYaml";
import {
  getSectionVariantId,
  initEnteredValue,
} from "state/actions/sectionVariants";
import { getParamUIType } from "state/actions/uiTypes/uiTypeCols";
import {
  useOriginalYamlObj,
  useSectionVariants,
  useYamlValue,
} from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function ClearValues({ sectionId }) {
  function onClick() {
    const { variantId } = getSectionVariantId(sectionId);

    useSectionVariants.setState((x) => {
      for (const k of Object.keys(x.x[variantId].values)) {
        x.x[variantId].values[k] = initEnteredValue(
          getParamUIType(sectionId, k),
        );
      }
    });

    const { displayMode } = getSectionInfo(sectionId);
    if (displayMode === SECTION_DISPLAY_MODES.YAML) {
      guiToYaml(
        sectionId,
        (y) => useYamlValue.setState({ [sectionId]: y }),
        (y) => useOriginalYamlObj.setState({ [sectionId]: y }),
      );
    }
  }

  return <MenuItem onClick={onClick}>Clear Values</MenuItem>;
}
