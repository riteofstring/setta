import { useUITypes } from "models/info/uiTypes";
import { useEffect, useState } from "react";
import { isUserPreset } from "z_utils/uiTypeConstants";
import { SaveLoadModal } from "../SaveLoadModal/SaveLoadModal";

export function SaveUITypeConfigModal({ open }) {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    if (open) {
      const uiTypes = Object.values(useUITypes.getState().x).filter(
        isUserPreset
      );
      setFiles(uiTypes);
    }
  }, [open]);

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      //   onClickActionButton={onSubmit}
      title="Save UI Type As"
      buttonText="Save As"
      placeholder="Preset Name"
    />
  );
}
