import { SaveLoadModal } from "./SaveLoadModal";

export function UITypePresetSaveModal({
  files,
  onClickActionButton,
  children,
}) {
  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onClickActionButton}
      title="Save UI Type As"
      buttonText="Save As"
      placeholder="Preset Name"
    >
      {children}
    </SaveLoadModal>
  );
}
