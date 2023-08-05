import { SaveLoadModal } from "./SaveLoadModal";

export function UITypePresetSaveModal({
  files,
  onClickActionButton,
  open,
  setOpen,
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
      open={open}
      setOpen={setOpen}
    >
      {children}
    </SaveLoadModal>
  );
}
