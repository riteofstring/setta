import * as Dialog from "@radix-ui/react-dialog";
import { isUserPreset } from "abcde-utils/src/uiTypeConstants";
import { useUITypes } from "models/info/uiTypes";
import { useState } from "react";
import { BiSave } from "react-icons/bi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { SaveLoadModal } from "utils/FileExplorer/SaveLoadModal";

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
          <BiSave className="dark:text-slate:200 text-slate-500" />
        </IconButton>
      </Dialog.Trigger>
    </SaveLoadModal>
  );
}
