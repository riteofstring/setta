import * as Dialog from "@radix-ui/react-dialog";
import { BiSave } from "react-icons/bi";

export function SaveUITypeConfig() {
  function openUITypesModal() {
    //TODO
  }

  return (
    <Dialog.Trigger asChild>
      <button
        className="nodrag flex inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent px-2 py-2 text-setta-500 hover:bg-setta-100 focus-visible:ring-2 dark:hover:bg-setta-800/50"
        onClick={openUITypesModal}
      >
        <BiSave className="text-setta-500 dark:text-setta-600" />
      </button>
    </Dialog.Trigger>
  );
}
