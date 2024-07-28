import * as Dialog from "@radix-ui/react-dialog";
import { BiSave } from "react-icons/bi";
import { setModalType } from "state/actions/modal";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { MODAL_TYPE } from "utils/constants";

export function SaveUITypeConfig() {
  function openUITypesModal() {
    setModalType(MODAL_TYPE.SAVE_UI_TYPE_CONFIG);
  }

  return (
    <Dialog.Trigger asChild>
      <IconButton size="w-4 h-4" padding="py-2 px-2" onClick={openUITypesModal}>
        <BiSave className="text-setta-500 dark:text-setta-200" />
      </IconButton>
    </Dialog.Trigger>
  );
}
