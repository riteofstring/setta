import * as Dialog from "@radix-ui/react-dialog";
import { useUITypes } from "models/info/uiTypes";
import { useState } from "react";
import { BiSave } from "react-icons/bi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { SaveLoadModal } from "utils/SaveLoadModal/SaveLoadModal";
import { isUserPreset } from "z_utils/uiTypeConstants";

export function SaveUITypeConfig({ onSubmit }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);

  function openUITypesModal() {
    const uiTypes = Object.values(useUITypes.getState().x).filter(isUserPreset);
    setFiles(uiTypes);
    setOpen(true);
  }

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onSubmit}
      title="Save UI Type As"
      buttonText="Save As"
      placeholder="Preset Name"
      open={open}
      setOpen={setOpen}
    >
      <Dialog.Trigger asChild>
        <IconButton
          size="w-4 h-4"
          padding="py-2 px-2"
          onClick={openUITypesModal}
        >
          <BiSave className="text-slate-500 dark:text-runcoder-200" />
        </IconButton>
      </Dialog.Trigger>
    </SaveLoadModal>
  );
}
