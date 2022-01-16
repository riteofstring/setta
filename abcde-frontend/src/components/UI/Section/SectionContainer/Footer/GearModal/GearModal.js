import SaveLoadModal from "utils/FileExplorer/SaveLoadModal";

import ParamSweepModal from "./ParamSweepModal/ParamSweepModal";

const foldersAndFiles = { folder1: ["apple", "bear"] };

export default function GearModal(props) {
  switch (props.name) {
    case "LOAD":
    case "SAVE":
      return (
        <SaveLoadModal
          onClose={props.onClose}
          isOpen={props.isOpen}
          buttonText={props.name}
          foldersAndFiles={foldersAndFiles}
        />
      );
    case "PARAM_SWEEP":
      return <ParamSweepModal isOpen={props.isOpen} onClose={props.onClose} />;
    default:
      return null;
  }
}
