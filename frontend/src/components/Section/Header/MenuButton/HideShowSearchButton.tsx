import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { getSectionVariant } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";

export function HideShowSearchButton({ sectionId }) {
  const { selectedItem, hideSearch, hideParams } = useProjectState((x) => {
    return {
      selectedItem: getSectionVariant(sectionId, x).selectedItem,
      hideSearch: x.sections[sectionId].hideSearch,
      hideParams: x.sections[sectionId].hideParams,
    };
  }, _.isEqual);

  function onClick() {
    useProjectState.setState((state) => {
      state.sections[sectionId].hideSearch = !hideSearch;
    });
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
