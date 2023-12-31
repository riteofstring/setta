import { useModal } from "models/modal";
import { useEffect, useState } from "react";
import { saveKwargsAsCollection } from "thunks/kwargs";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";

export function SaveCustomArgumentsModal({ open }) {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    // async function fn() {
    //   await getCollectionsAndModulesFn((x) => setFiles(Object.values(x)))();
    // }
    // if (open) {
    //   fn();
    // }
  }, [open]);

  function onClickSaveCustomArguments({ filename }) {
    const sectionId = useModal.getState().modalData;
    saveKwargsAsCollection({
      sectionId,
      name: filename,
    });
  }

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onClickSaveCustomArguments}
      title="Save Collection As"
      buttonText="Save As"
      placeholder="Collection Name"
    />
  );
}
