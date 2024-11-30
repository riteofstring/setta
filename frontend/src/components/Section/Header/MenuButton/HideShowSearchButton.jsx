import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useSectionSelectedItem } from "state/hooks/sectionVariants";

export function HideShowSearchButton({ sectionId }) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const { hideSearch, hideParams } = useSectionInfos((x) => {
    return {
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
