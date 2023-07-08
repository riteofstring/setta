import { SaveLoadModal } from "./SaveLoadModal";

export function ProjectSaveLoadModal({
  modalType,
  folders,
  onClickLoadProject,
  onClickSaveAsProject,
  children,
}) {
  const onClickActionButton =
    modalType === "Load" ? onClickLoadProject : onClickSaveAsProject;
  const title = modalType === "Load" ? "Load Project" : "Save Project As";

  return (
    <SaveLoadModal
      modalType={modalType}
      folders={folders}
      onClickActionButton={onClickActionButton}
      title={title}
      buttonText={modalType}
      placeholder="Config Name"
    >
      {children}
    </SaveLoadModal>
  );
}
