import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { createAdjacentSection } from "state/actions/sections/createSections";
import { goToSection } from "state/actions/sections/sectionPositions";
import { createParamSweepSectionName } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import { BASE_UI_TYPE_IDS } from "utils/baseUITypes";
import { createNewId } from "utils/idNameCreation";

export function MultirunButton({ sectionId }) {
  function onClick(e) {
    const { paramSweepSectionId } =
      useProjectState.getState().sections[sectionId];
    if (paramSweepSectionId) {
      goToSection(paramSweepSectionId);
    } else {
      addParamSweepSection(sectionId);
    }
  }

  return <MenuItem onClick={onClick}>Add Param Sweep</MenuItem>;
}

function addParamSweepSection(sectionId) {
  const newSectionId = createNewId();

  useProjectState.setState((state) => {
    state.sections[sectionId].paramSweepSectionId = newSectionId;

    createAdjacentSection(
      sectionId,
      {
        id: newSectionId,
        name: createParamSweepSectionName(state.sections[sectionId].name),
        uiTypeId: BASE_UI_TYPE_IDS.PARAM_SWEEP,
      },
      state,
    );
  });
}
