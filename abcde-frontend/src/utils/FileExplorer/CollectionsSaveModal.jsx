import { SaveLoadModal } from "./SaveLoadModal";

export function CollectionsSaveModal({ files, onClickActionButton, children }) {
  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onClickActionButton}
      title="Save Collection As"
      buttonText="Save As"
      placeholder="Collection Name"
    >
      {children}
    </SaveLoadModal>
  );
}
