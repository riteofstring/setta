import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";

export function ShowMarkdown({ sectionId }) {
  //TODO change this variable name
  const showYaml = useGetSectionInfo(sectionId, "showYaml");

  function onClick() {
    setSectionInfoAttr({ sectionId, attr: "showYaml", value: !showYaml });
  }

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return (
    <MenuItem onClick={onClick}>
      {showYaml ? "Render Markdown" : "Edit Markdown"}
    </MenuItem>
  );
}
