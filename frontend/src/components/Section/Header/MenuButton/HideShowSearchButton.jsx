import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";
import { useSectionSelectedItem } from "state/hooks/sectionVariants";

export function HideShowSearchButton({ sectionId }) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const hideSearch = useGetSectionInfo(sectionId, "hideSearch");
  const hideParams = useGetSectionInfo(sectionId, "hideParams");

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
