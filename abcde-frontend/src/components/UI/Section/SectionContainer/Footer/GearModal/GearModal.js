import SaveLoadModal from "utils/FileExplorer/SaveLoadModal";

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
    default:
      return null;
  }
}
