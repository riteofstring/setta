import { useSectionInfos } from "models/info/sectionInfos";
import { useParamSweep } from "models/paramSweep";
import { goToSection } from "thunks/goToSection";
import { getSectionName } from "thunks/sections/getters";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import {
  getParamSweepSectionName,
  PARAM_SWEEP_UI_TYPE_ID,
} from "z_utils/constants";
import { createEVColName, createNewId } from "z_utils/utils";
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
    .initParamSweep({ id: paramSweepId, name: createEVColName() });

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
    uiTypeId: PARAM_SWEEP_UI_TYPE_ID,
  });
}
