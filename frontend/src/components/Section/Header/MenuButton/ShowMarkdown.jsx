import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function RenderInfo({ sectionId }) {
  //TODO change this variable name
  const { displayMode, renderMarkdown } = useSectionInfos((x) => {
    return {
      displayMode: x.x[sectionId].displayMode,
      renderMarkdown: x.x[sectionId].renderMarkdown,
    };
  }, _.isEqual);

  function onClick() {
    setSectionInfoAttr({
      sectionId,
      attr: "displayMode",
      value:
        displayMode === SECTION_DISPLAY_MODES.RENDER
          ? SECTION_DISPLAY_MODES.EDIT
          : SECTION_DISPLAY_MODES.RENDER,
    });
  }

  const format = renderMarkdown ? "Markdown" : "Plaintext";

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return (
    <MenuItem onClick={onClick}>
      {displayMode === SECTION_DISPLAY_MODES.EDIT
        ? `Render ${format}`
        : `Edit ${format}`}
    </MenuItem>
  );
}

export function ConvertFormat({ sectionId }) {
  const renderMarkdown = useSectionInfos((x) => x.x[sectionId].renderMarkdown);

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
