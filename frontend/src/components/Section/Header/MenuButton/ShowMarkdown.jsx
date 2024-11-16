import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";

export function RenderInfo({ sectionId }) {
  //TODO change this variable name
  const showYaml = useGetSectionInfo(sectionId, "showYaml");
  const renderMarkdown = useGetSectionInfo(sectionId, "renderMarkdown");

  function onClick() {
    setSectionInfoAttr({ sectionId, attr: "showYaml", value: !showYaml });
  }

  const format = renderMarkdown ? "Markdown" : "Plaintext";

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return (
    <MenuItem onClick={onClick}>
      {showYaml ? `Render ${format}` : `Edit ${format}`}
    </MenuItem>
  );
}

export function ConvertFormat({ sectionId }) {
  //TODO change this variable name
  const renderMarkdown = useGetSectionInfo(sectionId, "renderMarkdown");

  function onClick() {
    setSectionInfoAttr({
      sectionId,
      attr: "renderMarkdown",
      value: !renderMarkdown,
    });
  }

  const format = renderMarkdown ? "Plaintext" : "Markdown";

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return <MenuItem onClick={onClick}>{`Convert to ${format}`}</MenuItem>;
}
