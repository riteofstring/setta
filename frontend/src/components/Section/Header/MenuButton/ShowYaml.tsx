import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { useProjectState } from "state/definitions";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function ShowYaml({ sectionId }) {
  const displayMode = useProjectState((x) => x.sections[sectionId].displayMode);

  function onClick() {
    useProjectState.setState((state) => {
      const newDisplayMode =
        displayMode === SECTION_DISPLAY_MODES.YAML
          ? SECTION_DISPLAY_MODES.GUI
          : SECTION_DISPLAY_MODES.YAML;
      state.sections[sectionId].displayMode = newDisplayMode;

      const { height: currHeight, width: currWidth } =
        state.sections[sectionId].size;
      if (
        newDisplayMode === SECTION_DISPLAY_MODES.YAML &&
        (currHeight === "auto" || currWidth === "auto")
      ) {
        // This is to avoid flickering when in "auto" mode.
        // It gets set back to its original size in useCodeAreaHeight.
        state.sections[sectionId].tempSavedSize =
          state.sections[sectionId].size;
        const { width, height } = getSectionRect(sectionId);
        state.sections[sectionId].size = { width, height };
      }
    });
  }

  return (
    <MenuItem onClick={onClick}>
      {displayMode === SECTION_DISPLAY_MODES.YAML ? "Show GUI" : "Show Yaml"}
    </MenuItem>
  );
}
