import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { createAdjacentSection } from "state/actions/sections/createSections";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useSectionInfos } from "state/definitions";
import { getSectionName } from "state/getters/sectionInfo";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { createNewId } from "utils/idNameCreation";
import { createParamSweepSectionName } from "utils/sectionTypeHelpers";

export function MultirunButton({ sectionId }) {
  function onClick(e) {
    const { paramSweepSectionId } = useSectionInfos.getState().x[sectionId];
    if (paramSweepSectionId) {
      goToSection(paramSweepSectionId);
      e.stopPropagation();
    } else {
      addParamSweepSection(sectionId);
    }
  }

  return <MenuItem onClick={onClick}>Add Param Sweep</MenuItem>;
}

function addParamSweepSection(sectionId) {
  const newSectionId = createNewId();
  setSectionInfoAttr({
    sectionId,
    attr: "paramSweepSectionId",
    value: newSectionId,
  });

  createAdjacentSection(sectionId, {
    id: newSectionId,
    name: createParamSweepSectionName(getSectionName(sectionId)),
    uiTypeId: BASE_UI_TYPE_IDS.PARAM_SWEEP,
  });
}
