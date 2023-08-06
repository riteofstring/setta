import * as Dialog from "@radix-ui/react-dialog";
import { BiSave } from "react-icons/bi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { UITypePresetSaveModal } from "utils/FileExplorer/UITypePresetSaveModal";

export function SaveUITypeConfig({ onSubmit }) {
  return (
    <UITypePresetSaveModal onClickActionButton={onSubmit}>
      <Dialog.Trigger asChild>
        <IconButton size="w-4 h-4" padding="py-2 px-2">
          <BiSave className="text-slate-500 dark:text-runcoder-200" />
        </IconButton>
      </Dialog.Trigger>
    </UITypePresetSaveModal>
  );
}
