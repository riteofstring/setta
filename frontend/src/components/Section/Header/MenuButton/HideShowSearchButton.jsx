import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";

export function HideShowSearchButton({ sectionId }) {
  const selectedItem = useGetSectionInfo(sectionId, "selectedItem");
  const hideSearch = useGetSectionInfo(sectionId, "hideSearch");

  function onClick() {
    setSectionInfoAttr({ sectionId, attr: "hideSearch", value: !hideSearch });
  }

  return (
    !selectedItem && (
      <MenuItem onClick={onClick}>
        {hideSearch ? "Show Search" : "Hide Search"}
      </MenuItem>
    )
  );
}
