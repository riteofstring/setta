import * as Dialog from "@radix-ui/react-dialog";
import { useModal } from "models/modal";
import { BiSave } from "react-icons/bi";
import { IconButton } from "utils/atoms/buttons/IconButton";

export function SaveUITypeConfig() {
  const setModalType = useModal((x) => x.setModalType);

  function openUITypesModal() {
    setModalType("SaveUITypeConfig");
  }

  return (
    <Dialog.Trigger asChild>
      <IconButton size="w-4 h-4" padding="py-2 px-2" onClick={openUITypesModal}>
        <BiSave className="text-runcoder-500 dark:text-runcoder-200" />
      </IconButton>
    </Dialog.Trigger>
  );
}
