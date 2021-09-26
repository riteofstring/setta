import SaveLoadModal from "../../../../../../utils/FileExplorer/SaveLoadModal";
import ParamSweepModal from "./ParamSweepModal/ParamSweepModal";
import UITypesModal from "./UITypesModal/UITypesModal";

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
    case "UI_TYPES":
      return (
        <UITypesModal
          isOpen={props.isOpen}
          onClose={props.onClose}
          sectionId={props.sectionId}
        />
      );
    default:
      return null;
  }
}
