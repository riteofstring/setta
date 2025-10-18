import * as Dialog from "@radix-ui/react-dialog";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { BiSave } from "react-icons/bi";

export function SaveUITypeConfig() {
  function openUITypesModal() {
    //TODO
  }

  return (
    <Dialog.Trigger asChild>
      <IconButton
        size="w-4 h-4"
        padding="py-2 px-2"
        bg="bg-transparent hover:bg-setta-100 dark:hover:bg-setta-800/50"
        onClick={openUITypesModal}
      >
        <BiSave className="text-setta-500 dark:text-setta-600" />
      </IconButton>
    </Dialog.Trigger>
  );
}
