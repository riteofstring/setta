import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useHasParams } from "state/hooks/sectionContents";

export function HideShowParamsButton({ sectionId }) {
  const hasParams = useHasParams(sectionId);
  const { hideSearch, hideParams } = useSectionInfos((x) => {
    return {
      hideSearch: x.x[sectionId].hideSearch,
      hideParams: x.x[sectionId].hideParams,
    };
  }, _.isEqual);

  function onClick() {
    setSectionInfoAttr({ sectionId, attr: "hideParams", value: !hideParams });
  }

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return (
    !hasParams &&
    !hideSearch && (
      <MenuItem onClick={onClick}>
        {hideParams ? "Show Params" : "Hide Params"}
      </MenuItem>
    )
  );
}
