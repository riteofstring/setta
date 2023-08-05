import { SaveLoadModal } from "./SaveLoadModal";

export function ProjectSaveLoadModal({
  modalType,
  files,
  onClickLoadProject,
  onClickSaveAsProject,
  open,
  setOpen,
  children,
}) {
  const onClickActionButton =
    modalType === "Load" ? onClickLoadProject : onClickSaveAsProject;
  const title = modalType === "Load" ? "Load Project" : "Save Project As";

  return (
    <SaveLoadModal
      modalType={modalType}
      files={files}
      onClickActionButton={onClickActionButton}
      title={title}
      buttonText={modalType}
      placeholder="Config Name"
      open={open}
      setOpen={setOpen}
    >
      {children}
    </SaveLoadModal>
  );
}
