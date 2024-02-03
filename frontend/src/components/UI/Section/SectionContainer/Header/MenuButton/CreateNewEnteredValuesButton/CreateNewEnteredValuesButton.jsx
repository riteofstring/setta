import { useModal } from "models/modal";
import { DialogMenuBarTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";

export function CreateNewEnteredValuesButton({ sectionId }) {
  function openModal() {
    useModal.getState().setModalData(sectionId);
    useModal.getState().setModalType("Create New Entered Values");
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      Create New Entered Values
    </DialogMenuBarTriggerItem>
  );
}
