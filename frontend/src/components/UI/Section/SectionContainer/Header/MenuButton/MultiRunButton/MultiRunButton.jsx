import { useParamSweep } from "models/paramSweep";
import { setSectionInfoAttr } from "state/actions/setters";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { getSectionName } from "state/getters/sectionInfo";
import { goToSection } from "state/actions/goToSection";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { getParamSweepSectionName } from "z_utils/constants";
import { createNewId, createRandomName } from "z_utils/utils";
import { creatAdjacentSection } from "../utils";

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

  useParamSweep
    .getState()
    .initParamSweep({ id: paramSweepId, name: createRandomName() });

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

  creatAdjacentSection(sectionId, {
    id: newSectionId,
    name: getParamSweepSectionName(getSectionName(sectionId)),
    uiTypeId: BASE_UI_TYPE_IDS.PARAM_SWEEP,
  });
}
