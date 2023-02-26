import { useUserPresetUITypes } from "hooks/useUITypes";
import { SaveLoadModal } from "./SaveLoadModal";

export function UITypePresetSaveModal({ onClickActionButton, children }) {
  const files = useUserPresetUITypes().map((x) => x.name);

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
