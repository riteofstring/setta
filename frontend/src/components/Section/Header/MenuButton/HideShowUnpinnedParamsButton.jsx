import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";

export function HideShowUnpinnedParamsButton({ sectionId }) {
  const hideUnpinnedParams = useGetSectionInfo(sectionId, "hideUnpinnedParams");

  function onClick() {
    setSectionInfoAttr({
      sectionId,
      attr: "hideUnpinnedParams",
      value: !hideUnpinnedParams,
    });
  }

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return (
    <MenuItem onClick={onClick}>
      {hideUnpinnedParams ? "Show Unpinned Params" : "Hide Unpinned Params"}
    </MenuItem>
  );
}
