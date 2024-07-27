import { useEffect, useState } from "react";
import { cloneNewUIType } from "state/actions/uiTypes/cloneUITypes";
import { setParamUITypeConfig } from "state/actions/uiTypes/setParamUITypeConfig";
import { setParamUITypeId } from "state/actions/uiTypes/setParamUITypeId";
import { deleteUIType } from "state/actions/uiTypes/uiTypes";
import { useUITypes } from "state/definitions";
import { isPreset, isUserPreset } from "utils/sectionTypeHelpers";
import { SaveLoadModal } from "../SaveLoadModal/SaveLoadModal";

export function SaveUITypeConfigModal({ open }) {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    if (open) {
      const uiTypes = Object.values(useUITypes.getState().x).filter(
        isUserPreset,
      );
      setFiles(uiTypes);
    }
  }, [open]);

  function onSaveAsSubmit({ filename }) {
    const newUIType = cloneNewUIType({
      uiType,
      name: filename,
      presetType: PresetType.USER,
    });
    setParamUITypeConfig({ uiType: newUIType });
    setParamUITypeId({
      uiTypeId: newUIType.id,
      sectionId,
      paramInfoId,
    });
    // delete old uitype if its a non-preset
    if (!isPreset(uiType)) {
      deleteUIType({ uiTypeId: uiType.id });
    }
  }

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onSaveAsSubmit}
      title="Save UI Type As"
      buttonText="Save As"
      placeholder="Preset Name"
    />
  );
}
