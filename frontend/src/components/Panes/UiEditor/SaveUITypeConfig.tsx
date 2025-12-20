import * as Dialog from "@radix-ui/react-dialog";
import { BiSave } from "react-icons/bi";

export function SaveUITypeConfig() {
  function openUITypesModal() {
    //TODO
  }

  return (
    <Dialog.Trigger asChild>
      <button
        className="focus-visible:ring-2 inline-flex items-center nodrag cursor-pointer flex justify-center bg-transparent hover:bg-setta-100 dark:hover:bg-setta-800/50 text-setta-500 rounded-full py-2 px-2 w-4 h-4"
        onClick={openUITypesModal}
      >
        <BiSave className="text-setta-500 dark:text-setta-600" />
      </button>
    </Dialog.Trigger>
  );
}
