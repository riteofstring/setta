import { getCollectionsAndModulesFn } from "dbRequests/sectionConfig";
import { useState } from "react";
import { BiSave } from "react-icons/bi";
import { saveKwargsAsCollection } from "thunks/kwargs";
import { getSectionInfo } from "thunks/sections/getters";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { DialogDropdownTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { SaveLoadModal } from "utils/SaveLoadModal/SaveLoadModal";

export function SaveButton({ sectionId }) {
  const [files, setFiles] = useState([]);
  const [type, setType] = useState("");
  const [open, setOpen] = useState(false);

  function onClickSaveCustomArguments({ filename }) {
    saveKwargsAsCollection({
      sectionId,
      objInfoId: getSectionInfo(sectionId).selectedItem,
      name: filename,
    });
  }

  async function openCustomArgumentsModal() {
    setType("Custom Arguments");
    await getCollectionsAndModulesFn((x) => setFiles(Object.values(x)))();
    setOpen(true);
  }

  const onClickActionButton = onClickSaveCustomArguments;

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onClickActionButton}
      title="Save Collection As"
      buttonText="Save As"
      placeholder="Collection Name"
      open={open}
      setOpen={setOpen}
    >
      <MenuItems openCustomArgumentsModal={openCustomArgumentsModal} />
    </SaveLoadModal>
  );
}

function MenuItems({ openCustomArgumentsModal }) {
  return (
    <StandardDropdown
      trigger={<IconButton color="text-slate-400" icon={<BiSave />} />}
      content={
        <DialogDropdownTriggerItem onClick={openCustomArgumentsModal}>
          Save Custom Arguments
        </DialogDropdownTriggerItem>
      }
    />
  );
}
