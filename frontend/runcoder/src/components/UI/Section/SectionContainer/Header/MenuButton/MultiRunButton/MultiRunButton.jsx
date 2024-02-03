import { useParamSweep } from "models/paramSweep";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { PARAM_SWEEP_UI_TYPE_ID } from "z_utils/constants";
import { createEVColName, createNewId } from "z_utils/utils";
import { creatAdjacentSection } from "../utils";

export function MultirunButton({ sectionId }) {
  function onClick() {
    addParamSweepSection(sectionId);
  }

  return <MenuItem onClick={onClick}>Multi-Run</MenuItem>;
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
    uiTypeId: PARAM_SWEEP_UI_TYPE_ID,
  });
}
