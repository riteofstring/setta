import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { getSectionVariantToShow } from "state/actions/sectionVariants";
import { useSectionInfos } from "state/definitions";

export function HideShowSearchButton({ sectionId }) {
  const { selectedItem, hideSearch, hideParams } = useSectionInfos((x) => {
    return {
      selectedItem: getSectionVariantToShow(sectionId, x).selectedItem,
      hideSearch: x.x[sectionId].hideSearch,
      hideParams: x.x[sectionId].hideParams,
    };
  }, _.isEqual);

  function onClick() {
    setSectionInfoAttr({ sectionId, attr: "hideSearch", value: !hideSearch });
  }

  return (
    !selectedItem &&
    !hideParams && (
      <MenuItem onClick={onClick}>
        {hideSearch ? "Show Search" : "Hide Search"}
      </MenuItem>
    )
  );
}
