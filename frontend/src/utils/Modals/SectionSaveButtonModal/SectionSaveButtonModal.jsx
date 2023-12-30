import { getCollectionsAndModulesFn } from "dbRequests/sectionConfig";
import { useParamInfos } from "models/info/paramInfos";
import { useEffect, useState } from "react";
import { saveKwargsAsCollection } from "thunks/kwargs";
import { getSectionInfo } from "thunks/sections/getters";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";
import { createNewId } from "z_utils/utils";

export function SectionSaveButtonModal({ sectionId, modalType, open }) {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    async function fn() {
      await getCollectionsAndModulesFn((x) => setFiles(Object.values(x)))();
    }
    if (open && modalType === "Custom Arguments") {
      fn();
    }
  }, [open, modalType]);

  function onClickSaveCustomArguments({ filename }) {
    saveKwargsAsCollection({
      sectionId,
      objInfoId: getSectionInfo(sectionId).selectedItem,
      name: filename,
    });
  }

  function onClickCreateNewEnteredValues({ filename }) {
    const currId = getSectionInfo(sectionId).evColId;
    const newId = createNewId();
    useParamInfos
      .getState()
      .duplicateEvCol({ id: currId, newId, newName: filename });
    setSectionInfoAttr({ sectionId, attr: "evColId", value: newId });
    setSectionInfoAttr({
      sectionId,
      attr: "evColIds",
      newValueFn: (x) => [...x, newId],
    });
  }

  const onClickActionButton =
    modalType === "Custom Arguments"
      ? onClickSaveCustomArguments
      : onClickCreateNewEnteredValues;

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onClickActionButton}
      title="Save Collection As"
      buttonText="Save As"
      placeholder="Collection Name"
    />
  );
}
