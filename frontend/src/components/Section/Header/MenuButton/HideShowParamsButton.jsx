import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useHasParams } from "state/hooks/sectionContents";
import { useGetSectionInfo } from "state/hooks/sections";

export function HideShowParamsButton({ sectionId }) {
  const hasParams = useHasParams(sectionId);
  const hideSearch = useGetSectionInfo(sectionId, "hideSearch");
  const hideParams = useGetSectionInfo(sectionId, "hideParams");

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
