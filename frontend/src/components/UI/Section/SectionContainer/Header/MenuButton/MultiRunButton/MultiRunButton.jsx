import { createAdjacentSection } from "state/actions/sections/createSections";
import { goToSection } from "state/actions/goToSection";
import { initParamSweep } from "state/actions/paramSweep";
import { setSectionInfoAttr } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { getSectionName } from "state/getters/sectionInfo";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { createNewId, createRandomName } from "utils/idNameCreation";
import { getParamSweepSectionName } from "utils/sectionTypeHelpers";

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

  return <MenuItem onClick={onClick}>Param Sweep</MenuItem>;
}

function addParamSweepSection(sectionId) {
  const newSectionId = createNewId();
  const paramSweepId = createNewId();

  initParamSweep({ id: paramSweepId, name: createRandomName() });

  setSectionInfoAttr({ sectionId, attr: "paramSweepId", value: paramSweepId });
  setSectionInfoAttr({
    sectionId,
    attr: "paramSweepIds",
    value: [paramSweepId],
  });
  setSectionInfoAttr({
    sectionId,
    attr: "paramSweepSectionId",
    value: newSectionId,
  });

  createAdjacentSection(sectionId, {
    id: newSectionId,
    name: getParamSweepSectionName(getSectionName(sectionId)),
    uiTypeId: BASE_UI_TYPE_IDS.PARAM_SWEEP,
  });
}
