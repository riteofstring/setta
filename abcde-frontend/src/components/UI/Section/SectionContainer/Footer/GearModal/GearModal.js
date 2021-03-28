import SaveLoadModal from "../../../../../../utils/FileExplorer/SaveLoadModal";
import ParamSweepModal from "./ParamSweepModal/ParamSweepModal";

export default function GearModal({ gearModalSwitch }) {
  switch (gearModalSwitch) {
    case "LOAD":
      return <SaveLoadModal />;
    case "SAVE":
      return <SaveLoadModal />;
    case "PARAM_SWEEP":
      return <ParamSweepModal />;
    default:
      return null;
  }
}
