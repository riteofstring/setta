import { useModal } from "models/modal";
import { DialogMenuBarTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";

export function CreateNewVersionButton({ sectionId }) {
  function openModal() {
    useModal.getState().setModalData(sectionId);
    useModal.getState().setModalType("New Version");
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      New Version
    </DialogMenuBarTriggerItem>
  );
}
