import { SaveLoadModal } from "./SaveLoadModal";

export function UITypePresetSaveModal({
  files,
  onClickActionButton,
  children,
}) {
  const title = "Save UI Type As";

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onClickActionButton}
      title={title}
      buttonText="Save As"
      placeholder="Preset Name"
    >
      {children}
    </SaveLoadModal>
  );
}
