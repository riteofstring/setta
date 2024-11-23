import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import {
  getSectionVariantId,
  initEnteredValue,
} from "state/actions/sectionVariants";
import { getParamUIType } from "state/actions/uiTypes/uiTypeCols";
import { useSectionVariants } from "state/definitions";

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
  }

  return <MenuItem onClick={onClick}>Clear Values</MenuItem>;
}
