import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FiSave } from "react-icons/fi";
import { saveKwargsAsCollection } from "thunks/kwargs";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { DialogDropdownTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { CollectionsSaveModal } from "utils/FileExplorer/CollectionsSaveModal";

export function SaveButton({ sectionId }) {
  function onClickSaveAsCollection() {
    saveKwargsAsCollection({ sectionId });
  }

  return (
    <CollectionsSaveModal files={[]}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <IconButton color="text-slate-400" icon={<FiSave />} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="z-[1000] flex select-none flex-col gap-1 rounded-md bg-white py-2 px-4 drop-shadow"
          >
            <DialogDropdownTriggerItem>
              Save Custom Arguments
            </DialogDropdownTriggerItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </CollectionsSaveModal>
  );
}
