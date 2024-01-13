import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { PARAM_SWEEP_UI_TYPE_ID } from "z_utils/constants";
import { creatAdjacentSection } from "../utils";

export function MultirunButton({ sectionId }) {
  function onClick() {
    addParamSweepSection(sectionId);
  }

  return <MenuItem onClick={onClick}>Multi-Run</MenuItem>;
}

function addParamSweepSection(sectionId) {
  creatAdjacentSection(sectionId, { uiTypeId: PARAM_SWEEP_UI_TYPE_ID });
}
