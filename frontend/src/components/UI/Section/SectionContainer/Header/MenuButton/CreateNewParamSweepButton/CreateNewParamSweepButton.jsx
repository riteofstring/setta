import { useModal } from "state/definitions/modal";
import { DialogMenuBarTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";

export function CreateNewParamSweepButton({ sectionId }) {
  function openModal() {
    useModal.getState().setModalData(sectionId);
    useModal.getState().setModalType("New Param Sweep");
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      New Version
    </DialogMenuBarTriggerItem>
  );
}
