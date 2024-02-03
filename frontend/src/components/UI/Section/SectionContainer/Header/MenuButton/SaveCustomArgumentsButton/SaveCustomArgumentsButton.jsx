import { useModal } from "models/modal";
import { DialogMenuBarTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";

export function SaveCustomArgumentsButton({ sectionId }) {
  function openModal() {
    useModal.getState().setModalData(sectionId);
    useModal.getState().setModalType("Custom Arguments");
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      Save Custom Arguments
    </DialogMenuBarTriggerItem>
  );
}
