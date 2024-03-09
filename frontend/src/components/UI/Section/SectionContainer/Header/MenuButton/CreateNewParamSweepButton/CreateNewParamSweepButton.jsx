import { useModal } from "models/modal";
import { DialogMenuBarTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";

export function CreateNewParamSweepButton({ sectionId }) {
  function openModal() {
    useModal.getState().setModalData(sectionId);
    useModal.getState().setModalType("Create New Param Sweep");
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      Create New Param Sweep
    </DialogMenuBarTriggerItem>
  );
}
